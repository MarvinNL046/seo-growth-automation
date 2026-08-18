import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SiteProfile } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateSiteProfile(value: unknown, requireReady = false): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(value)) return { errors: ["Profile must be a JSON object."], warnings };

  if (value.schemaVersion !== 1) errors.push("schemaVersion must equal 1.");
  if (!nonEmpty(value.domain) || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value.domain)) errors.push("domain must be a bare valid domain.");
  if (!nonEmpty(value.niche)) errors.push("niche is required.");

  const locale = value.locale;
  if (!isRecord(locale)) errors.push("locale is required.");
  else {
    if (!nonEmpty(locale.id) || !/^[a-z]{2}-[A-Z]{2}$/.test(locale.id)) errors.push("locale.id must look like en-US.");
    if (!Number.isInteger(locale.locationCode) || Number(locale.locationCode) < 1) errors.push("locale.locationCode must be a positive integer.");
    if (!nonEmpty(locale.languageCode) || !/^[a-z]{2}$/.test(locale.languageCode)) errors.push("locale.languageCode must be two lowercase letters.");
    if (!nonEmpty(locale.marketLabel)) errors.push("locale.marketLabel is required.");
  }

  const repository = value.repository;
  if (!isRecord(repository)) errors.push("repository is required.");
  else {
    for (const key of ["projectPath", "remote", "defaultBranch", "productionBranch", "hosting"] as const) {
      if (!nonEmpty(repository[key])) errors.push(`repository.${key} is required.`);
    }
    if (typeof repository.rollbackDocumented !== "boolean") errors.push("repository.rollbackDocumented must be boolean.");
    if (requireReady && repository.rollbackDocumented !== true) errors.push("Readiness requires repository.rollbackDocumented=true.");
  }

  const cadence = value.cadence;
  if (cadence !== undefined) {
    if (!isRecord(cadence)) errors.push("cadence must be an object when present.");
    else if (!Number.isInteger(cadence.runsPerWeek) || Number(cadence.runsPerWeek) < 1) {
      errors.push("cadence.runsPerWeek must be a positive integer.");
    }
  }

  const policy = value.publicationPolicy;
  const ymyl = isRecord(value.sourcePolicy) && value.sourcePolicy.ymyl === true;
  let overrideAccepted = false;
  if (!isRecord(policy)) errors.push("publicationPolicy is required.");
  else {
    if (policy.mode !== "pr-only" && policy.mode !== "split") {
      errors.push("publicationPolicy.mode must be pr-only or split.");
    }
    if (typeof policy.permanentPrOnly !== "boolean") errors.push("publicationPolicy.permanentPrOnly must be boolean.");
    if (!Number.isInteger(policy.initialPrOnlyRuns) || Number(policy.initialPrOnlyRuns) < 3) errors.push("publicationPolicy.initialPrOnlyRuns must be at least 3.");
    if (policy.maxActionsPerRun !== 1) errors.push("publicationPolicy.maxActionsPerRun must equal 1.");

    // "split" is the only way off PR-only, and it is deliberately expensive to
    // declare: a site owner has to name themselves, date it, say why, and spell
    // out what stays behind review. Anything missing falls back to PR-only,
    // because a half-written override is exactly when a run should not merge.
    if (policy.mode === "split") {
      const over = policy.mergeOverride;
      if (!isRecord(over)) {
        errors.push("publicationPolicy.mode=split requires publicationPolicy.mergeOverride.");
      } else {
        const missing: string[] = [];
        if (!nonEmpty(over.approvedBy)) missing.push("approvedBy");
        if (!nonEmpty(over.approvedOn) || !/^\d{4}-\d{2}-\d{2}$/.test(String(over.approvedOn))) missing.push("approvedOn (YYYY-MM-DD)");
        if (!nonEmpty(over.reason)) missing.push("reason");
        if (!nonEmpty(over.prOnlyFor)) missing.push("prOnlyFor");
        if (!Array.isArray(over.neverAutonomous) || over.neverAutonomous.length < 1 || over.neverAutonomous.some((item) => !nonEmpty(item))) {
          missing.push("neverAutonomous (non-empty string array)");
        }
        if (over.mergeAllowedFor !== "technical" && over.mergeAllowedFor !== "all") {
          missing.push("mergeAllowedFor (technical or all)");
        }
        if (missing.length) errors.push(`publicationPolicy.mergeOverride is incomplete: ${missing.join(", ")}.`);

        // A YMYL site may automate technical work, never its own claims. There
        // is no combination of fields that unlocks autonomous content merging
        // where wrong copy can cost a reader money.
        if (ymyl && over.mergeAllowedFor === "all") {
          errors.push("YMYL profiles cannot set mergeOverride.mergeAllowedFor=all; only technical changes may merge.");
        }
        if (!missing.length && !(ymyl && over.mergeAllowedFor === "all")) overrideAccepted = true;
      }
      if (policy.permanentPrOnly === true) {
        errors.push("publicationPolicy.mode=split contradicts permanentPrOnly=true.");
      }
    }
  }

  const measurement = value.measurement;
  if (!isRecord(measurement)) errors.push("measurement is required.");
  else {
    if (!["configured", "export-only", "unavailable"].includes(String(measurement.gscStatus))) errors.push("measurement.gscStatus is invalid.");
    if (typeof measurement.gscProperty !== "string") errors.push("measurement.gscProperty must be a string.");
    if (measurement.gscStatus === "configured" && !nonEmpty(measurement.gscProperty)) errors.push("Configured GSC requires measurement.gscProperty.");
    if (!Array.isArray(measurement.baselineWindowsDays) || measurement.baselineWindowsDays[0] !== 28 || measurement.baselineWindowsDays[1] !== 56 || measurement.baselineWindowsDays.length !== 2) {
      errors.push("measurement.baselineWindowsDays must equal [28, 56].");
    }
    if (measurement.gscStatus === "unavailable") warnings.push("GSC is unavailable; the run must label measurement limitations.");
  }

  const dfs = value.dataForSEO;
  if (!isRecord(dfs)) errors.push("dataForSEO is required.");
  else {
    if (!Array.isArray(dfs.seedKeywords) || dfs.seedKeywords.length < 1 || dfs.seedKeywords.some((item) => !nonEmpty(item))) errors.push("dataForSEO.seedKeywords must contain at least one non-empty seed.");
    if (!Number.isInteger(dfs.minSearchVolume) || Number(dfs.minSearchVolume) < 0) errors.push("dataForSEO.minSearchVolume must be a non-negative integer.");
    if (!finiteNumber(dfs.maxKeywordDifficulty) || Number(dfs.maxKeywordDifficulty) < 0 || Number(dfs.maxKeywordDifficulty) > 100) errors.push("dataForSEO.maxKeywordDifficulty must be between 0 and 100.");
    if (!Number.isInteger(dfs.ideaLimit) || Number(dfs.ideaLimit) < 1 || Number(dfs.ideaLimit) > 700) errors.push("dataForSEO.ideaLimit must be between 1 and 700.");
    if (!nonEmpty(dfs.subjectPattern)) errors.push("dataForSEO.subjectPattern is required.");
    if (typeof dfs.excludePattern !== "string") errors.push("dataForSEO.excludePattern must be a string.");
    if (!Number.isInteger(dfs.deepValidationMinimum) || Number(dfs.deepValidationMinimum) < 3 || Number(dfs.deepValidationMinimum) > 10) errors.push("dataForSEO.deepValidationMinimum must be between 3 and 10.");
    for (const [key, pattern] of [["subjectPattern", dfs.subjectPattern], ["excludePattern", dfs.excludePattern]] as const) {
      if (typeof pattern === "string" && pattern) {
        try { new RegExp(pattern, "i"); } catch { errors.push(`dataForSEO.${key} is not a valid regular expression.`); }
      }
    }
  }

  const commands = value.commands;
  if (!isRecord(commands)) errors.push("commands is required.");
  else for (const key of ["install", "test", "build"] as const) if (!nonEmpty(commands[key])) errors.push(`commands.${key} is required.`);

  const source = value.sourcePolicy;
  if (!isRecord(source)) errors.push("sourcePolicy is required.");
  else {
    if (typeof source.ymyl !== "boolean") errors.push("sourcePolicy.ymyl must be boolean.");
    if (typeof source.primarySourceRequired !== "boolean") errors.push("sourcePolicy.primarySourceRequired must be boolean.");
    if (!Array.isArray(source.preferredDomains) || source.preferredDomains.some((item) => !nonEmpty(item))) errors.push("sourcePolicy.preferredDomains must be a string array.");
    if (!Array.isArray(source.forbiddenClaims) || source.forbiddenClaims.some((item) => !nonEmpty(item))) errors.push("sourcePolicy.forbiddenClaims must be a string array.");
    if (source.ymyl === true && source.primarySourceRequired !== true) errors.push("YMYL profiles require primarySourceRequired=true.");
    // Still the default. It is only waived by a complete, accepted split
    // override, so simply flipping the flag changes nothing.
    if (source.ymyl === true && isRecord(policy) && policy.permanentPrOnly !== true && !overrideAccepted) {
      errors.push("YMYL profiles require permanentPrOnly=true unless publicationPolicy declares a complete mode=split mergeOverride.");
    }
  }

  if (requireReady && nonEmpty(value.domain) && value.domain === "example.com") errors.push("Readiness requires replacing the example domain.");
  return { errors, warnings };
}

export async function loadSiteProfile(profilePath: string, requireReady = false): Promise<SiteProfile> {
  const absolute = resolve(profilePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(absolute, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read site profile ${absolute}: ${message}`);
  }
  const result = validateSiteProfile(parsed, requireReady);
  if (result.errors.length) throw new Error(`Invalid site profile:\n- ${result.errors.join("\n- ")}`);
  return parsed as SiteProfile;
}
