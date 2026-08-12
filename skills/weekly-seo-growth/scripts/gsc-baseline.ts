import { parseArgs, one, requireOne } from "./lib/args.ts";
import { buildComparisonPeriods, exchangeRefreshToken, loadAuthorizedUserCredential, querySearchConsole } from "./lib/gsc.ts";
import { dateStamp, writeArtifact } from "./lib/output.ts";
import { loadSiteProfile } from "./lib/profile.ts";

function defaultEndDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 3);
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const profilePath = requireOne(args, "profile");
  const outputRoot = requireOne(args, "out");
  const dryRun = args.flags.has("dry-run");
  const confirmed = args.flags.has("confirm-read-api");
  if (dryRun === confirmed) throw new Error("Choose exactly one: --dry-run or --confirm-read-api.");

  const profile = await loadSiteProfile(profilePath, true);
  if (profile.measurement.gscStatus !== "configured") {
    throw new Error(`GSC status is ${profile.measurement.gscStatus}; a configured property is required.`);
  }
  const endDate = one(args, "end-date") ?? defaultEndDate();
  const periods = buildComparisonPeriods(endDate);
  const plan = {
    mode: dryRun ? "dry-run" : "read-api",
    property: profile.measurement.gscProperty,
    periods,
    requests: periods.length * 2,
    rowLimitPerPeriod: 1000,
  };
  if (dryRun) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }

  const credentialPath = process.env.GSC_OAUTH_CREDENTIALS?.trim();
  if (!credentialPath) throw new Error("GSC_OAUTH_CREDENTIALS is required for --confirm-read-api.");
  const credential = await loadAuthorizedUserCredential(credentialPath);
  const accessToken = await exchangeRefreshToken(credential);
  const results = [];
  for (const period of periods) {
    const common = {
      startDate: period.startDate,
      endDate: period.endDate,
      dataState: "final",
      type: "web",
    };
    const totals = await querySearchConsole({
      accessToken,
      property: profile.measurement.gscProperty,
      body: { ...common, rowLimit: 1 },
    });
    const queryPages = await querySearchConsole({
      accessToken,
      property: profile.measurement.gscProperty,
      body: { ...common, dimensions: ["query", "page"], rowLimit: 1000, startRow: 0 },
    });
    results.push({
      ...period,
      totals: totals.rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      queryPages: queryPages.rows ?? [],
      rowCount: queryPages.rows?.length ?? 0,
      bounded: (queryPages.rows?.length ?? 0) === 1000,
    });
  }

  const artifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "Google Search Console Search Analytics API",
    property: profile.measurement.gscProperty,
    profileDomain: profile.domain,
    note: "Query/page rows are bounded top rows and may omit anonymized or lower-volume data.",
    results,
  };
  const target = await writeArtifact({
    outputRoot,
    directories: [profile.domain],
    filename: `${dateStamp()}-gsc-baseline.json`,
    content: `${JSON.stringify(artifact, null, 2)}\n`,
    force: args.flags.has("force"),
  });
  process.stdout.write(`${JSON.stringify({ status: "ok", artifact: target, periods: periods.length, requests: periods.length * 2 }, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`GSC baseline failed: ${message}\n`);
  process.exitCode = 1;
});
