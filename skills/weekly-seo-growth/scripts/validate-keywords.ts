#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { parseArgs, many, requireApiMode, requireOne } from "./lib/args.ts";
import { DataForSeoClient } from "./lib/dataforseo-client.ts";
import { dateStamp, resolveOutputRoot, safeArtifactPath, slugify, writeArtifact } from "./lib/output.ts";
import { loadSiteProfile } from "./lib/profile.ts";
import { extractValidation, validationMarkdown } from "./lib/research.ts";

const OVERVIEW_ENDPOINT = "/dataforseo_labs/google/keyword_overview/live";
const SERP_ENDPOINT = "/serp/google/organic/live/advanced";

function uniqueKeywords(values: string[]): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed && !unique.has(trimmed.toLowerCase())) unique.set(trimmed.toLowerCase(), trimmed);
  }
  return [...unique.values()];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const profile = await loadSiteProfile(requireOne(args, "profile"));
  const outputRoot = resolveOutputRoot(requireOne(args, "out"));
  const mode = requireApiMode(args);
  const force = args.flags.has("force");
  const keywords = uniqueKeywords(many(args, "keyword"));
  if (keywords.length < profile.dataForSEO.deepValidationMinimum) {
    throw new Error(`Supply at least ${profile.dataForSEO.deepValidationMinimum} distinct --keyword values.`);
  }
  if (keywords.length > 10) throw new Error("Deep validation is limited to ten keywords per run.");

  const date = dateStamp();
  const digest = createHash("sha256").update([...keywords].sort((a, b) => a.localeCompare(b)).join("\n").toLowerCase()).digest("hex").slice(0, 10);
  const stem = `${date}-validation-${slugify(keywords[0], 35)}-${digest}`;
  const directories = [profile.domain, profile.locale.id];
  const jsonName = `${stem}.json`;
  const markdownName = `${stem}.md`;
  const jsonPath = safeArtifactPath(outputRoot, ...directories, jsonName);
  const markdownPath = safeArtifactPath(outputRoot, ...directories, markdownName);
  const plan = {
    mode,
    domain: profile.domain,
    market: profile.locale.marketLabel,
    endpoints: [OVERVIEW_ENDPOINT, SERP_ENDPOINT],
    httpRequests: 2,
    paidTasks: keywords.length + 1,
    candidateCount: keywords.length,
    serpDepth: 20,
    outputs: [jsonPath, markdownPath]
  };
  if (mode === "dry-run") {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  if (!force && (existsSync(jsonPath) || existsSync(markdownPath))) {
    throw new Error("This same-day validation batch already exists. Review it instead of spending again, or deliberately pass --force.");
  }

  const client = new DataForSeoClient();
  const [overviewResponse, serpResponse] = await Promise.all([
    client.post(OVERVIEW_ENDPOINT, [{
      keywords,
      location_code: profile.locale.locationCode,
      language_code: profile.locale.languageCode,
      include_serp_info: true
    }]),
    client.post(SERP_ENDPOINT, keywords.map((keyword) => ({
      keyword,
      location_code: profile.locale.locationCode,
      language_code: profile.locale.languageCode,
      device: "desktop",
      os: "windows",
      depth: 20
    })))
  ]);
  const result = extractValidation(overviewResponse, serpResponse, keywords);
  const artifact = {
    generatedAt: new Date().toISOString(),
    domain: profile.domain,
    market: profile.locale,
    source: { provider: "DataForSEO", endpoints: [OVERVIEW_ENDPOINT, SERP_ENDPOINT], reportedCost: result.reportedCost },
    results: result.keywords
  };
  const markdown = validationMarkdown({ date, market: profile.locale.marketLabel, domain: profile.domain, validation: result.keywords, reportedCost: result.reportedCost });
  const [writtenJson, writtenMarkdown] = await Promise.all([
    writeArtifact({ outputRoot, directories, filename: jsonName, content: `${JSON.stringify(artifact, null, 2)}\n`, force }),
    writeArtifact({ outputRoot, directories, filename: markdownName, content: markdown, force })
  ]);
  process.stdout.write(`${JSON.stringify({ domain: profile.domain, keywords: keywords.length, reportedCost: result.reportedCost, outputs: [writtenJson, writtenMarkdown] }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
