import type { DataForSeoResponse, DataForSeoTask, SiteProfile } from "./types.ts";

type JsonRecord = Record<string, any>;

function resultItems(task: DataForSeoTask | undefined): JsonRecord[] {
  const first = task?.result?.[0] as JsonRecord | undefined;
  return Array.isArray(first?.items) ? first.items : [];
}

export interface DiscoveryRow {
  keyword: string;
  searchVolume: number;
  keywordDifficulty: number;
  intent: string | null;
  cpc: number | null;
}

export function extractDiscovery(response: DataForSeoResponse, profile: SiteProfile): {
  scanned: number;
  candidates: DiscoveryRow[];
  rejected: { missingDifficulty: number; lowVolume: number; highDifficulty: number; offTopic: number; excluded: number };
  reportedCost: number;
} {
  const items = resultItems(response.tasks?.[0]);
  const subject = new RegExp(profile.dataForSEO.subjectPattern, "i");
  const excluded = profile.dataForSEO.excludePattern ? new RegExp(profile.dataForSEO.excludePattern, "i") : null;
  const rejected = { missingDifficulty: 0, lowVolume: 0, highDifficulty: 0, offTopic: 0, excluded: 0 };
  const candidates: DiscoveryRow[] = [];

  for (const item of items) {
    const keyword = typeof item.keyword === "string" ? item.keyword.trim() : "";
    const searchVolume = Number(item.keyword_info?.search_volume ?? 0);
    const rawDifficulty = item.keyword_properties?.keyword_difficulty;
    const keywordDifficulty = rawDifficulty === null || rawDifficulty === undefined ? null : Number(rawDifficulty);
    if (keywordDifficulty === null || !Number.isFinite(keywordDifficulty)) { rejected.missingDifficulty += 1; continue; }
    if (searchVolume < profile.dataForSEO.minSearchVolume) { rejected.lowVolume += 1; continue; }
    if (keywordDifficulty > profile.dataForSEO.maxKeywordDifficulty) { rejected.highDifficulty += 1; continue; }
    if (!subject.test(keyword)) { rejected.offTopic += 1; continue; }
    if (excluded?.test(keyword)) { rejected.excluded += 1; continue; }
    candidates.push({
      keyword,
      searchVolume,
      keywordDifficulty,
      intent: item.search_intent_info?.main_intent ?? null,
      cpc: item.keyword_info?.cpc ?? null
    });
  }
  candidates.sort((left, right) => right.searchVolume - left.searchVolume || left.keywordDifficulty - right.keywordDifficulty || left.keyword.localeCompare(right.keyword));
  const reportedCost = (response.tasks ?? []).reduce((sum, task) => sum + Number(task.cost ?? 0), 0);
  return { scanned: items.length, candidates, rejected, reportedCost };
}

export interface OrganicRow {
  rank: number | null;
  title: string;
  url: string;
  domain: string;
  description: string;
}

export interface KeywordValidation {
  keyword: string;
  overview: {
    searchVolume: number | null;
    cpc: number | null;
    competition: string | null;
    keywordDifficulty: number | null;
    intent: string | null;
    monthlySearches: unknown[];
  };
  organic: OrganicRow[];
  peopleAlsoAsk: string[];
  relatedSearches: string[];
  serpFeatures: string[];
}

function walk(value: unknown, visitor: (item: JsonRecord) => void): void {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value)) visitor(value as JsonRecord);
  for (const child of Array.isArray(value) ? value : Object.values(value as JsonRecord)) walk(child, visitor);
}

export function extractPeopleAlsoAsk(items: JsonRecord[]): string[] {
  const questions = new Set<string>();
  walk(items, (item) => {
    if (item.type !== "people_also_ask") return;
    walk(item.items ?? [], (child) => {
      const value = child.title ?? child.question ?? child.text;
      if (typeof value === "string" && value.trim()) questions.add(value.trim());
    });
  });
  return [...questions];
}

export function extractRelatedSearches(items: JsonRecord[]): string[] {
  const related = new Set<string>();
  walk(items, (item) => {
    if (!new Set(["related_searches", "related_search", "people_also_search"]).has(String(item.type))) return;
    walk(item.items ?? [], (child) => {
      const value = child.title ?? child.keyword ?? child.text;
      if (typeof value === "string" && value.trim()) related.add(value.trim());
    });
  });
  return [...related];
}

function organicRows(items: JsonRecord[]): OrganicRow[] {
  return items.filter((item) => item.type === "organic").slice(0, 10).map((item) => ({
    rank: Number.isFinite(Number(item.rank_absolute ?? item.rank_group)) ? Number(item.rank_absolute ?? item.rank_group) : null,
    title: item.title ?? "",
    url: item.url ?? "",
    domain: item.domain ?? "",
    description: item.description ?? ""
  }));
}

function overviewMap(response: DataForSeoResponse): Map<string, JsonRecord> {
  const map = new Map<string, JsonRecord>();
  for (const item of resultItems(response.tasks?.[0])) {
    if (typeof item.keyword === "string") map.set(item.keyword.toLowerCase(), item);
  }
  return map;
}

/**
 * `serpResponses` holds one response per keyword, in the same order. The live
 * SERP endpoint accepts a single task per request, so each keyword is its own
 * call rather than one call carrying a task array.
 */
export function extractValidation(overviewResponse: DataForSeoResponse, serpResponses: DataForSeoResponse[], keywords: string[]): {
  keywords: KeywordValidation[];
  reportedCost: number;
} {
  if (serpResponses.length !== keywords.length) {
    throw new Error(`Expected one SERP response per keyword: got ${serpResponses.length} for ${keywords.length} keywords.`);
  }
  const overview = overviewMap(overviewResponse);
  const validation = keywords.map((keyword, index) => {
    const overviewItem = overview.get(keyword.toLowerCase()) ?? {};
    const items = resultItems(serpResponses[index]?.tasks?.[0]);
    return {
      keyword,
      overview: {
        searchVolume: overviewItem.keyword_info?.search_volume ?? null,
        cpc: overviewItem.keyword_info?.cpc ?? null,
        competition: overviewItem.keyword_info?.competition_level ?? null,
        keywordDifficulty: overviewItem.keyword_properties?.keyword_difficulty ?? null,
        intent: overviewItem.search_intent_info?.main_intent ?? null,
        monthlySearches: overviewItem.keyword_info?.monthly_searches ?? []
      },
      organic: organicRows(items),
      peopleAlsoAsk: extractPeopleAlsoAsk(items),
      relatedSearches: extractRelatedSearches(items),
      serpFeatures: [...new Set(items.map((item) => item.type).filter(Boolean))].sort()
    } satisfies KeywordValidation;
  });
  const tasks = [...(overviewResponse.tasks ?? []), ...serpResponses.flatMap((response) => response.tasks ?? [])];
  const reportedCost = tasks.reduce((sum, task) => sum + Number(task.cost ?? 0), 0);
  return { keywords: validation, reportedCost };
}

export function validationMarkdown(input: { date: string; market: string; domain: string; validation: KeywordValidation[]; reportedCost: number }): string {
  const lines = [
    `# Keyword and live SERP validation — ${input.domain}`,
    "",
    `- Research date: ${input.date}`,
    `- Market: ${input.market}`,
    `- Shortlisted keywords: ${input.validation.length}`,
    `- DataForSEO-reported cost: $${input.reportedCost.toFixed(4)}`,
    "",
    "Metrics and SERP evidence are observations, not permission to publish. Complete competitor content/source analysis and cannibalisation checks before selecting an action.",
    ""
  ];
  for (const item of input.validation) {
    lines.push(
      `## ${item.keyword}`,
      "",
      `- Intent: ${item.overview.intent ?? "not returned"}`,
      `- Search volume: ${item.overview.searchVolume ?? "not returned"}`,
      `- Keyword difficulty: ${item.overview.keywordDifficulty ?? "not returned"}`,
      `- CPC: ${item.overview.cpc ?? "not returned"}`,
      `- SERP features: ${item.serpFeatures.join(", ") || "organic only"}`,
      "",
      "### Top organic results",
      "",
      ...(item.organic.length ? item.organic.map((row) => `${row.rank ?? "?"}. [${row.title || row.domain}](${row.url}) — ${row.domain}`) : ["No organic results returned."]),
      "",
      "### People Also Ask",
      "",
      ...(item.peopleAlsoAsk.length ? item.peopleAlsoAsk.map((question, index) => `${index + 1}. ${question}`) : ["No PAA questions returned."]),
      "",
      "### Related searches",
      "",
      ...(item.relatedSearches.length ? item.relatedSearches.map((query, index) => `${index + 1}. ${query}`) : ["No related searches returned."]),
      ""
    );
  }
  lines.push(
    "## Required follow-up",
    "",
    "- Compare the top three pages' format, headings, content depth, sources, schema, and user task.",
    "- Research every selected PAA answer against authoritative sources.",
    "- Run the cannibalisation check against the live keyword register.",
    "- Compare at least three candidates and document why the selected action wins.",
    ""
  );
  return lines.join("\n");
}
