import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { extractDiscovery, extractPeopleAlsoAsk, extractRelatedSearches } from "../skills/weekly-seo-growth/scripts/lib/research.ts";

const profile = JSON.parse(readFileSync(new URL("../skills/weekly-seo-growth/assets/site-profile.template.json", import.meta.url), "utf8"));

test("discovery applies relevance, volume, and KD gates after the API response", () => {
  profile.dataForSEO.subjectPattern = "image|compressor";
  profile.dataForSEO.excludePattern = "video";
  const response = {
    status_code: 20000,
    tasks: [{ status_code: 20000, cost: 0.02, result: [{ items: [
      { keyword: "image compressor", keyword_info: { search_volume: 1000, cpc: 1 }, keyword_properties: { keyword_difficulty: 10 }, search_intent_info: { main_intent: "commercial" } },
      { keyword: "video compressor", keyword_info: { search_volume: 900 }, keyword_properties: { keyword_difficulty: 5 } },
      { keyword: "image editor", keyword_info: { search_volume: 50 }, keyword_properties: { keyword_difficulty: 5 } },
      { keyword: "image optimizer", keyword_info: { search_volume: 500 }, keyword_properties: { keyword_difficulty: 50 } }
    ] }] }]
  };
  const result = extractDiscovery(response, profile);
  assert.deepEqual(result.candidates.map((row) => row.keyword), ["image compressor"]);
  assert.equal(result.reportedCost, 0.02);
  assert.equal(result.rejected.excluded, 1);
  assert.equal(result.rejected.lowVolume, 1);
  assert.equal(result.rejected.highDifficulty, 1);
});

test("nested PAA and related searches are extracted explicitly", () => {
  const items: any[] = [
    { type: "people_also_ask", items: [{ title: "Is it free?" }, { items: [{ question: "Is it private?" }] }] },
    { type: "related_searches", items: [{ title: "compress png" }, { keyword: "compress jpg" }] }
  ];
  assert.deepEqual(extractPeopleAlsoAsk(items), ["Is it free?", "Is it private?"]);
  assert.deepEqual(extractRelatedSearches(items), ["compress png", "compress jpg"]);
});
