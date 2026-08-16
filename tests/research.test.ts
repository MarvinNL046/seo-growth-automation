import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { extractDiscovery, extractPeopleAlsoAsk, extractRelatedSearches, extractValidation } from "../skills/weekly-seo-growth/scripts/lib/research.ts";

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

test("validation reads one SERP response per keyword and sums every task cost", () => {
  const overviewResponse = {
    status_code: 20000,
    tasks: [{ status_code: 20000, cost: 0.0125, result: [{ items: [
      { keyword: "wifi qr code generator", keyword_info: { search_volume: 2900 }, keyword_properties: { keyword_difficulty: 20 } }
    ] }] }]
  };
  // One response per keyword, each carrying a single task, because the live
  // SERP endpoint refuses a task array.
  const serpResponses = [
    { status_code: 20000, tasks: [{ status_code: 20000, cost: 0.0035, result: [{ items: [
      { type: "organic", rank_absolute: 1, domain: "qifi.org", url: "https://qifi.org", title: "WiFi QR", description: "in-browser" }
    ] }] }] },
    { status_code: 20000, tasks: [{ status_code: 20000, cost: 0.0035, result: [{ items: [
      { type: "organic", rank_absolute: 1, domain: "genqrcode.com", url: "https://genqrcode.com", title: "vCard QR", description: "free" },
      { type: "people_also_ask", items: [{ title: "Is it free to generate a vCard QR code?" }] }
    ] }] }] }
  ];
  const keywords = ["wifi qr code generator", "vcard qr code generator"];
  const result = extractValidation(overviewResponse, serpResponses, keywords);

  assert.equal(result.keywords.length, 2);
  assert.equal(result.keywords[0].organic[0].domain, "qifi.org");
  assert.equal(result.keywords[0].overview.searchVolume, 2900);
  assert.equal(result.keywords[1].organic[0].domain, "genqrcode.com");
  assert.deepEqual(result.keywords[1].peopleAlsoAsk, ["Is it free to generate a vCard QR code?"]);
  assert.equal(result.reportedCost, 0.0195);
});

test("validation refuses a SERP response count that does not match the keywords", () => {
  assert.throws(
    () => extractValidation({ status_code: 20000, tasks: [] }, [{ status_code: 20000, tasks: [] }], ["one", "two"]),
    /one SERP response per keyword/
  );
});
