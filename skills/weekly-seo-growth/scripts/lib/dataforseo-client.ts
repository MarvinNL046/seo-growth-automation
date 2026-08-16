import type { DataForSeoResponse } from "./types.ts";

const API_BASE = "https://api.dataforseo.com/v3";
const ALLOWED_ENDPOINTS = new Set([
  "/dataforseo_labs/google/keyword_ideas/live",
  "/dataforseo_labs/google/keyword_overview/live",
  "/serp/google/organic/live/advanced"
]);

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type SleepLike = (milliseconds: number) => Promise<void>;
type LogLike = (event: Record<string, unknown>) => void;

export interface ClientOptions {
  fetchFn?: FetchLike;
  sleepFn?: SleepLike;
  logger?: LogLike;
  randomFn?: () => number;
  maxAttempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export function redactText(value: string): string {
  return value
    .replace(/Basic\s+[A-Za-z0-9+/=._-]+/gi, "Basic [REDACTED]")
    .replace(/("?(?:authorization|password|token|secret|DATAFORSEO_BASE64)"?\s*[:=]\s*)"?[^",\s}]+"?/gi, "$1[REDACTED]");
}

function defaultLogger(event: Record<string, unknown>): void {
  process.stderr.write(`${redactText(JSON.stringify(event))}\n`);
}

function authHeader(environment: NodeJS.ProcessEnv = process.env): string {
  const explicit = environment.DATAFORSEO_BASE64?.trim();
  if (explicit) return `Basic ${explicit}`;
  const login = environment.DATAFORSEO_LOGIN?.trim();
  const password = environment.DATAFORSEO_PASSWORD?.trim();
  if (!login || !password) {
    throw new Error("Missing DATAFORSEO_BASE64 or DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD.");
  }
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

function retryableHttp(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryAfterMilliseconds(response: Response, now = Date.now()): number | null {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

function taskFailure(response: DataForSeoResponse): string | null {
  if (response.status_code !== 20000) return `${response.status_code ?? "unknown"} ${response.status_message ?? "unknown DataForSEO error"}`;
  const failed = (response.tasks ?? []).filter((task) => task.status_code !== undefined && task.status_code !== 20000);
  const reported = response.tasks_error ?? 0;
  // A bare count says nothing about what went wrong. Carry the per-task
  // messages, which is the only place DataForSEO explains a partial failure.
  if (!failed.length) return reported > 0 ? `${reported} task error(s), but no failing task was returned.` : null;
  const shown = failed.slice(0, 3).map((task) => `${task.status_code} ${task.status_message ?? "task failed"}`);
  const remainder = failed.length > shown.length ? ` (+${failed.length - shown.length} more)` : "";
  return `${Math.max(reported, failed.length)} task error(s): ${shown.join("; ")}${remainder}`;
}

export class DataForSeoClient {
  private readonly fetchFn: FetchLike;
  private readonly sleepFn: SleepLike;
  private readonly logger: LogLike;
  private readonly randomFn: () => number;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: ClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleepFn = options.sleepFn ?? sleep;
    this.logger = options.logger ?? defaultLogger;
    this.randomFn = options.randomFn ?? Math.random;
    this.maxAttempts = options.maxAttempts ?? 4;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.baseDelayMs = options.baseDelayMs ?? 750;
    this.maxDelayMs = options.maxDelayMs ?? 8_000;
    if (this.maxAttempts < 1) throw new Error("maxAttempts must be at least 1.");
  }

  async post(endpoint: string, tasks: unknown[]): Promise<DataForSeoResponse> {
    if (!ALLOWED_ENDPOINTS.has(endpoint)) throw new Error(`DataForSEO endpoint is not allow-listed: ${endpoint}`);
    if (!Array.isArray(tasks) || tasks.length < 1) throw new Error("A DataForSEO request requires at least one task.");
    const authorization = authHeader();
    let previousError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        this.logger({ event: "dataforseo.request", endpoint, attempt, taskCount: tasks.length });
        const response = await this.fetchFn(`${API_BASE}${endpoint}`, {
          method: "POST",
          headers: { Authorization: authorization, "Content-Type": "application/json" },
          body: JSON.stringify(tasks),
          signal: controller.signal
        });
        const body = await response.text();
        if (!response.ok) {
          const error = new Error(`DataForSEO HTTP ${response.status} ${response.statusText}`);
          if (!retryableHttp(response.status) || attempt === this.maxAttempts) throw error;
          const retryAfter = retryAfterMilliseconds(response);
          const exponential = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (attempt - 1));
          const waitMs = retryAfter ?? Math.round(exponential * (0.75 + this.randomFn() * 0.5));
          this.logger({ event: "dataforseo.retry", endpoint, attempt, status: response.status, waitMs });
          await this.sleepFn(waitMs);
          continue;
        }

        let parsed: DataForSeoResponse;
        try { parsed = JSON.parse(body) as DataForSeoResponse; }
        catch { throw new Error("DataForSEO returned non-JSON content."); }
        const failure = taskFailure(parsed);
        if (failure) throw new Error(`DataForSEO API error: ${failure}`);
        const cost = (parsed.tasks ?? []).reduce((sum, task) => sum + Number(task.cost ?? 0), 0);
        this.logger({ event: "dataforseo.success", endpoint, attempt, taskCount: tasks.length, reportedCost: Number(cost.toFixed(4)) });
        return parsed;
      } catch (error) {
        previousError = error instanceof Error ? error : new Error(String(error));
        const retryableNetworkError = previousError.name === "AbortError" || /fetch|network|socket|timeout/i.test(previousError.message);
        if (!retryableNetworkError || attempt === this.maxAttempts) throw previousError;
        const exponential = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (attempt - 1));
        const waitMs = Math.round(exponential * (0.75 + this.randomFn() * 0.5));
        this.logger({ event: "dataforseo.retry", endpoint, attempt, reason: previousError.name, waitMs });
        await this.sleepFn(waitMs);
      } finally {
        clearTimeout(timer);
      }
    }
    throw previousError ?? new Error("DataForSEO request failed.");
  }
}
