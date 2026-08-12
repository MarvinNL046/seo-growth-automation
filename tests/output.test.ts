import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { safeArtifactPath, writeArtifact } from "../skills/weekly-seo-growth/scripts/lib/output.ts";

test("artifacts stay below explicit output and do not overwrite by default", async () => {
  const root = await mkdtemp(join(tmpdir(), "seo-growth-output-"));
  try {
    const path = await writeArtifact({ outputRoot: root, directories: ["example.com", "en-US"], filename: "report.json", content: "{}\n" });
    assert.equal(await readFile(path, "utf8"), "{}\n");
    await assert.rejects(() => writeArtifact({ outputRoot: root, directories: ["example.com", "en-US"], filename: "report.json", content: "changed" }), /EEXIST/);
    assert.throws(() => safeArtifactPath(root, "..", "escape.txt"), /Unsafe/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
