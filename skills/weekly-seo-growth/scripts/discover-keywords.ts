#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, requireApiMode, requireOne } from "./lib/args.ts";
import { DataForSeoClient } from "./lib/dataforseo-client.ts";
import { resolveOutputRoot, safeArtifactPath, writeArtifact, dateStamp } from "./lib/output.ts";
import { loadSiteProfile } from "./lib/profile.ts";
import { extractDiscovery } from "./lib/research.ts";

const ENDPOINT = "/dataforseo_labs/google/keyword_ideas/live";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const profilePath = requireOne(args, "profile");
  const outputRoot = resolveOutputRoot(requireOne(args, "out"));
  const mode = requireApiMode(args);
  const force = args.flags.has("force");
  const profile = await loadSiteProfile(profilePath);
  const date = dateStamp();
  const directories = [profile.domain, profile.locale.id];
  const jsonName = `${date}-discovery.json`;
  const markdownName = `${date}-discovery.md`;
  const jsonPath = safeArtifactPath(outputRoot, ...directories, jsonName);
  const markdownPath = safeArtifactPath(outputRoot, ...directories, markdownName);

  const plan = {
    mode,
    domain: profile.domain,
    market: profile.locale.marketLabel,
    endpoint: ENDPOINT,
    httpRequests: 1,
    paidTasks: 1,
    seedCount: profile.dataForSEO.seedKeywords.length,
    ideaLimit: profile.dataForSEO.ideaLimit,
    filtersAppliedAfterResponse: {
      minimumSearchVolume: profile.dataForSEO.minSearchVolume,
      maximumKeywordDifficulty: profile.dataForSEO.maxKeywordDifficulty,
      subjectPatternConfigured: true,
      excludePatternConfigured: Boolean(profile.dataForSEO.excludePattern)
    },
    outputs: [jsonPath, markdownPath]
  };
  if (mode === "dry-run") {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  if (!force && (existsSync(jsonPath) || existsSync(markdownPath))) {
    throw new Error("Same-day discovery artifacts already exist. Review them instead of spending again, or deliberately pass --force.");
  }

  const client = new DataForSeoClient();
  const response = await client.post(ENDPOINT, [{
    keywords: profile.dataForSEO.seedKeywords,
    location_code: profile.locale.locationCode,
    language_code: profile.locale.languageCode,
    limit: profile.dataForSEO.ideaLimit,
    order_by: ["keyword_info.search_volume,desc"]
  }]);
  const result = extractDiscovery(response, profile);
  const artifact = {
    generatedAt: new Date().toISOString(),
    domain: profile.domain,
    market: profile.locale,
    source: { provider: "DataForSEO", endpoint: ENDPOINT, reportedCost: result.reportedCost },
    filters: plan.filtersAppliedAfterResponse,
    scanned: result.scanned,
    rejected: result.rejected,
    candidates: result.candidates
  };
  const markdown = [
    `# Keyword discovery — ${profile.domain}`,
    "",
    `- Research date: ${date}`,
    `- Market: ${profile.locale.marketLabel}`,
    `- Ideas scanned: ${result.scanned}`,
    `- Candidates after hard filters: ${result.candidates.length}`,
    `- DataForSEO-reported cost: $${result.reportedCost.toFixed(4)}`,
    "",
    "| Keyword | Volume | KD | Intent | CPC |",
    "|---|---:|---:|---|---:|",
    ...result.candidates.map((row) => `| ${row.keyword.replace(/\|/g, "\\|")} | ${row.searchVolume} | ${row.keywordDifficulty} | ${row.intent ?? ""} | ${row.cpc ?? ""} |`),
    "",
    "Discovery is not a publication decision. Deep-validate at least three candidates against the live SERP, GSC, existing URLs, and the cannibalisation register.",
    ""
  ].join("\n");
  const [writtenJson, writtenMarkdown] = await Promise.all([
    writeArtifact({ outputRoot, directories, filename: jsonName, content: `${JSON.stringify(artifact, null, 2)}\n`, force }),
    writeArtifact({ outputRoot, directories, filename: markdownName, content: markdown, force })
  ]);
  process.stdout.write(`${JSON.stringify({ domain: profile.domain, scanned: result.scanned, candidates: result.candidates.length, reportedCost: result.reportedCost, outputs: [writtenJson, writtenMarkdown] }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
