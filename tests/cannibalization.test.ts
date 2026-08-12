import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCannibalization } from "../skills/weekly-seo-growth/scripts/lib/cannibalization.ts";

const owners = [
  { primary: "strong password generator", secondary: ["secure password maker"], status: "live", url: "/" },
  { primary: "jpg vs png", secondary: [], status: "live", url: "/jpg-vs-png" },
  { primary: "random word generator for games", secondary: [], status: "planned", url: "/random-words-for-games" }
];

test("exact live primary and live secondary collisions block", () => {
  assert.equal(checkCannibalization("password generator strong", owners)[0].severity, "BLOCK");
  const secondary = checkCannibalization("secure passwords maker", owners);
  assert.ok(secondary.some((hit) => hit.type === "SECONDARY" && hit.severity === "BLOCK"));
});

test("reversed comparison blocks and planned near-match is reviewable", () => {
  assert.ok(checkCannibalization("png versus jpg", owners).some((hit) => hit.type === "COMPARISON" && hit.severity === "BLOCK"));
  assert.ok(checkCannibalization("random word generator game", owners).some((hit) => hit.severity === "RESERVED"));
});

test("unrelated keyword is clear", () => {
  assert.deepEqual(checkCannibalization("mortgage amortization schedule", owners), []);
});
