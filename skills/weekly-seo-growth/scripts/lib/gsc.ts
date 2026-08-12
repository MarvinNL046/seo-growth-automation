import { readFile } from "node:fs/promises";

export interface AuthorizedUserCredential {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  token_uri?: string;
}

export interface GscRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

export interface GscQueryResponse {
  rows?: GscRow[];
  responseAggregationType?: string;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateAuthorizedUserCredential(value: unknown): AuthorizedUserCredential {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("GSC OAuth credential must be a JSON object.");
  }
  const record = value as Record<string, unknown>;
  for (const key of ["client_id", "client_secret", "refresh_token"] as const) {
    if (!nonEmpty(record[key])) throw new Error(`GSC OAuth credential is missing ${key}.`);
  }
  if (record.token_uri !== undefined && !nonEmpty(record.token_uri)) {
    throw new Error("GSC OAuth token_uri must be a non-empty string when present.");
  }
  return {
    client_id: String(record.client_id),
    client_secret: String(record.client_secret),
    refresh_token: String(record.refresh_token),
    token_uri: nonEmpty(record.token_uri) ? record.token_uri : undefined,
  };
}

export async function loadAuthorizedUserCredential(path: string): Promise<AuthorizedUserCredential> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read GSC OAuth credential: ${message}`);
  }
  return validateAuthorizedUserCredential(parsed);
}

async function fetchWithRetry(url: string, init: RequestInit, label: string): Promise<Response> {
  class NonRetryableHttpError extends Error {}
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) {
        throw new NonRetryableHttpError(`${label} failed with HTTP ${response.status}.`);
      }
      lastError = new Error(`${label} failed with HTTP ${response.status}.`);
    } catch (error) {
      if (error instanceof NonRetryableHttpError) throw error;
      lastError = error;
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed.`);
}

export async function exchangeRefreshToken(credential: AuthorizedUserCredential): Promise<string> {
  const body = new URLSearchParams({
    client_id: credential.client_id,
    client_secret: credential.client_secret,
    refresh_token: credential.refresh_token,
    grant_type: "refresh_token",
  });
  const response = await fetchWithRetry(
    credential.token_uri ?? "https://oauth2.googleapis.com/token",
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body },
    "Google OAuth token exchange",
  );
  const json = await response.json() as Record<string, unknown>;
  if (!nonEmpty(json.access_token)) throw new Error("Google OAuth response did not contain an access token.");
  return json.access_token;
}

export async function querySearchConsole(options: {
  accessToken: string;
  property: string;
  body: Record<string, unknown>;
}): Promise<GscQueryResponse> {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(options.property)}/searchAnalytics/query`;
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(options.body),
  }, "Search Console query");
  return await response.json() as GscQueryResponse;
}

export interface GscPeriod {
  label: "current28" | "previous28" | "current56" | "previous56";
  startDate: string;
  endDate: string;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function buildComparisonPeriods(endDate: string): GscPeriod[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error("GSC end date must use YYYY-MM-DD.");
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(end.valueOf()) || iso(end) !== endDate) throw new Error("GSC end date is invalid.");
  return [
    { label: "current28", startDate: iso(addDays(end, -27)), endDate },
    { label: "previous28", startDate: iso(addDays(end, -55)), endDate: iso(addDays(end, -28)) },
    { label: "current56", startDate: iso(addDays(end, -55)), endDate },
    { label: "previous56", startDate: iso(addDays(end, -111)), endDate: iso(addDays(end, -56)) },
  ];
}
