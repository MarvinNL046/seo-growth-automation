import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("../skills/weekly-seo-growth/references/", import.meta.url);

test("checklist snapshot contains 99 unique checks in 15 categories", () => {
  const snapshot = JSON.parse(readFileSync(new URL("seo-checklist.snapshot.json", ROOT), "utf8"));
  const provenance = JSON.parse(readFileSync(new URL("seo-checklist.provenance.json", ROOT), "utf8"));
  const items = snapshot.categories.flatMap((category: any) => category.items);
  assert.equal(snapshot.categories.length, 15);
  assert.equal(items.length, 99);
  assert.equal(new Set(items.map((item: any) => item.id)).size, 99);
  assert.equal(snapshot.sourceSha256, provenance.sourceSha256);
  assert.equal(provenance.sourceItemCount, 99);
  assert.equal(Object.values(provenance.countsByCategory).reduce((sum: number, count) => sum + Number(count), 0), 99);
  const markdown = readFileSync(new URL("seo-checklist.snapshot.md", ROOT), "utf8");
  assert.equal((markdown.match(/^- \[ \]/gm) ?? []).length, 99);
});

test("provenance hash matches the local canonical vault source when available", (context) => {
  const provenance = JSON.parse(readFileSync(new URL("seo-checklist.provenance.json", ROOT), "utf8"));
  if (!existsSync(provenance.sourcePath)) context.skip("Canonical vault is not present on this machine.");
  const hash = createHash("sha256").update(readFileSync(provenance.sourcePath)).digest("hex").toUpperCase();
  assert.equal(hash, provenance.sourceSha256);
});
