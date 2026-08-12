import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateSiteProfile } from "../skills/weekly-seo-growth/scripts/lib/profile.ts";

const TEMPLATE = JSON.parse(readFileSync(new URL("../skills/weekly-seo-growth/assets/site-profile.template.json", import.meta.url), "utf8"));

test("profile template is structurally valid but not Week-0 ready", () => {
  const structural = validateSiteProfile(TEMPLATE);
  assert.deepEqual(structural.errors, []);
  assert.ok(structural.warnings.some((warning) => warning.includes("GSC")));
  const ready = validateSiteProfile(TEMPLATE, true);
  assert.ok(ready.errors.some((error) => error.includes("rollbackDocumented")));
  assert.ok(ready.errors.some((error) => error.includes("example domain")));
});

test("YMYL profile requires primary sources and permanent PR-only delivery", () => {
  const profile = structuredClone(TEMPLATE);
  profile.sourcePolicy.ymyl = true;
  profile.sourcePolicy.primarySourceRequired = false;
  profile.publicationPolicy.permanentPrOnly = false;
  const result = validateSiteProfile(profile);
  assert.ok(result.errors.some((error) => error.includes("primarySourceRequired")));
  assert.ok(result.errors.some((error) => error.includes("permanentPrOnly")));
});
