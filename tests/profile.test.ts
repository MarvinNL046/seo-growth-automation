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

const COMPLETE_OVERRIDE = {
  approvedBy: "Site owner",
  approvedOn: "2026-08-16",
  reason: "Technical SEO debt was queueing behind review with no financial risk.",
  mergeAllowedFor: "technical",
  prOnlyFor: "Financial figures, claims, sources, disclosures and calculator logic.",
  neverAutonomous: ["DNS", "billing", "credentials", "deployment configuration"],
};

function splitProfile(overrides = {}) {
  const profile = structuredClone(TEMPLATE);
  profile.publicationPolicy.mode = "split";
  profile.publicationPolicy.permanentPrOnly = false;
  profile.publicationPolicy.mergeOverride = { ...structuredClone(COMPLETE_OVERRIDE), ...overrides };
  return profile;
}

test("split mode is refused without a mergeOverride", () => {
  const profile = structuredClone(TEMPLATE);
  profile.publicationPolicy.mode = "split";
  profile.publicationPolicy.permanentPrOnly = false;
  const result = validateSiteProfile(profile);
  assert.ok(result.errors.some((error) => error.includes("requires publicationPolicy.mergeOverride")));
});

test("a complete override lets a YMYL site merge technical work", () => {
  const profile = splitProfile();
  profile.sourcePolicy.ymyl = true;
  profile.sourcePolicy.primarySourceRequired = true;
  const result = validateSiteProfile(profile);
  assert.deepEqual(result.errors, []);
});

test("every field of the override is load-bearing", () => {
  const cases: [string, unknown][] = [
    ["approvedBy", ""],
    ["approvedOn", "16 August 2026"],
    ["reason", "  "],
    ["prOnlyFor", ""],
    ["neverAutonomous", []],
    ["mergeAllowedFor", "whatever"],
  ];
  for (const [field, bad] of cases) {
    const result = validateSiteProfile(splitProfile({ [field]: bad }));
    assert.ok(
      result.errors.some((error) => error.includes("mergeOverride is incomplete")),
      `${field} should be required`,
    );
  }
});

test("a YMYL site cannot buy autonomous content merging at any price", () => {
  const profile = splitProfile({ mergeAllowedFor: "all" });
  profile.sourcePolicy.ymyl = true;
  profile.sourcePolicy.primarySourceRequired = true;
  const result = validateSiteProfile(profile);
  assert.ok(result.errors.some((error) => error.includes("cannot set mergeOverride.mergeAllowedFor=all")));
  // and the PR-only requirement is not waived by the rejected override
  assert.ok(result.errors.some((error) => error.includes("permanentPrOnly")));
});

test("flipping permanentPrOnly alone still fails, override or not", () => {
  const profile = structuredClone(TEMPLATE);
  profile.sourcePolicy.ymyl = true;
  profile.sourcePolicy.primarySourceRequired = true;
  profile.publicationPolicy.permanentPrOnly = false;
  const result = validateSiteProfile(profile);
  assert.ok(result.errors.some((error) => error.includes("permanentPrOnly")));
});

test("split mode contradicts permanentPrOnly=true", () => {
  const profile = splitProfile();
  profile.publicationPolicy.permanentPrOnly = true;
  const result = validateSiteProfile(profile);
  assert.ok(result.errors.some((error) => error.includes("contradicts permanentPrOnly=true")));
});

test("an unknown publication mode is rejected", () => {
  const profile = structuredClone(TEMPLATE);
  profile.publicationPolicy.mode = "yolo";
  const result = validateSiteProfile(profile);
  assert.ok(result.errors.some((error) => error.includes("must be pr-only or split")));
});
