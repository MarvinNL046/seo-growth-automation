import assert from "node:assert/strict";
import test from "node:test";
import { buildComparisonPeriods, validateAuthorizedUserCredential } from "../skills/weekly-seo-growth/scripts/lib/gsc.ts";

test("buildComparisonPeriods creates adjacent 28 and 56 day windows", () => {
  assert.deepEqual(buildComparisonPeriods("2026-08-09"), [
    { label: "current28", startDate: "2026-07-13", endDate: "2026-08-09" },
    { label: "previous28", startDate: "2026-06-15", endDate: "2026-07-12" },
    { label: "current56", startDate: "2026-06-15", endDate: "2026-08-09" },
    { label: "previous56", startDate: "2026-04-20", endDate: "2026-06-14" },
  ]);
});

test("authorized user credential validation is fail-closed", () => {
  assert.throws(() => validateAuthorizedUserCredential({ client_id: "x" }), /client_secret/);
  assert.deepEqual(validateAuthorizedUserCredential({ client_id: "a", client_secret: "b", refresh_token: "c" }), {
    client_id: "a",
    client_secret: "b",
    refresh_token: "c",
    token_uri: undefined,
  });
});
