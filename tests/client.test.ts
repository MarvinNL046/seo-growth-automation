import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { DataForSeoClient, redactText } from "../skills/weekly-seo-growth/scripts/lib/dataforseo-client.ts";

const originalLogin = process.env.DATAFORSEO_LOGIN;
const originalPassword = process.env.DATAFORSEO_PASSWORD;
const originalBase64 = process.env.DATAFORSEO_BASE64;

afterEach(() => {
  if (originalLogin === undefined) delete process.env.DATAFORSEO_LOGIN; else process.env.DATAFORSEO_LOGIN = originalLogin;
  if (originalPassword === undefined) delete process.env.DATAFORSEO_PASSWORD; else process.env.DATAFORSEO_PASSWORD = originalPassword;
  if (originalBase64 === undefined) delete process.env.DATAFORSEO_BASE64; else process.env.DATAFORSEO_BASE64 = originalBase64;
});

test("client retries a 429, records only redacted metadata, and returns success", async () => {
  process.env.DATAFORSEO_LOGIN = "user@example.test";
  process.env.DATAFORSEO_PASSWORD = "super-secret-password";
  delete process.env.DATAFORSEO_BASE64;
  const events: Record<string, unknown>[] = [];
  const waits: number[] = [];
  let calls = 0;
  const fetchFn = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls += 1;
    assert.match(String((init?.headers as Record<string, string>).Authorization), /^Basic /);
    if (calls === 1) return new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });
    return new Response(JSON.stringify({ status_code: 20000, tasks_error: 0, tasks: [{ status_code: 20000, cost: 0.01, result: [{ items: [] }] }] }), { status: 200 });
  };
  const client = new DataForSeoClient({ fetchFn, sleepFn: async (ms) => { waits.push(ms); }, logger: (event) => events.push(event), randomFn: () => 0, maxAttempts: 2 });
  const result = await client.post("/dataforseo_labs/google/keyword_ideas/live", [{ keywords: ["secret research keyword"] }]);
  assert.equal(result.status_code, 20000);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [0]);
  const logs = JSON.stringify(events);
  assert.doesNotMatch(logs, /super-secret-password|secret research keyword|Authorization/i);
});

test("client rejects non-allow-listed endpoints before making a request", async () => {
  process.env.DATAFORSEO_BASE64 = Buffer.from("login:password").toString("base64");
  let called = false;
  const client = new DataForSeoClient({ fetchFn: async () => { called = true; return new Response(); } });
  await assert.rejects(() => client.post("/unapproved/endpoint", [{}]), /not allow-listed/);
  assert.equal(called, false);
});

test("redaction removes basic tokens and password values", () => {
  const redacted = redactText('Authorization: Basic abc123 password=hunter2 DATAFORSEO_BASE64=token');
  assert.doesNotMatch(redacted, /abc123|hunter2|=token/);
  assert.match(redacted, /REDACTED/);
});
