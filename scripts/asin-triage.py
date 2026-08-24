#!/usr/bin/env python3
"""ASIN-triage voor affiliate-zoeklinks.

Leest de `amazon.com/s?k=...`-redirects uit een vercel.json, zoekt elk product
op bij Amazon via DataForSEO, en deelt ze in:

  FOUND      een ASIN die overtuigend bij het product hoort  -> omzetten naar /dp/<ASIN>
  REVIEW     iets gevonden, maar niet overtuigend             -> mens kijkt ernaar
  NOT_FOUND  het product bestaat niet op Amazon               -> link verwijderen

Die laatste categorie is de reden dat dit script bestaat. Veel aanbevolen merken
zijn direct-to-consumer (Cozy Earth, Brooklinen, Boll & Branch, Buffy) en verkopen
het product niet op Amazon; de zoeklink was een noodgreep. Blind converteren zou
ASIN's verzinnen.

Resultaten worden gecachet in <out>/cache.json, dus een herstart kost niets extra.

Gebruik:
    python scripts/asin-triage.py ../theduvetadvisor/vercel.json --out out/duvet
    python scripts/asin-triage.py ../thepillowadvisor/vercel.json --out out/pillow --limit 20
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

API = "https://api.dataforseo.com/v3/merchant/amazon/products/live/advanced"
COST_PER_CALL = 0.0033

# Woorden die niets zeggen over identiteit: maten, kleuren, generieke termen.
NOISE = {
    "the", "and", "with", "for", "a", "an", "of", "in", "size", "all", "season",
    "inch", "inches", "set", "piece", "pc", "x", "queen", "king", "twin", "full",
    "cal", "california", "standard", "oversized", "white", "grey", "gray", "beige",
    "black", "blue", "green", "sage", "charcoal", "insert", "cover",
}


def auth_header() -> str:
    """Haalt de DataForSEO Basic-auth op uit env of uit de MCP-config."""
    if os.environ.get("DFS_AUTH"):
        return os.environ["DFS_AUTH"]
    cfg = os.path.expanduser("~/.claude.json")
    with open(cfg, encoding="utf-8") as fh:
        data = json.load(fh)
    hdr = data["mcpServers"]["dfs-mcp"]["headers"]["Authorization"]
    return hdr.removeprefix("Basic ").strip()


def extract_products(vercel_json: str) -> dict[str, list[str]]:
    """product-naam -> lijst van /go/-slugs die ernaar wijzen."""
    with open(vercel_json, encoding="utf-8") as fh:
        cfg = json.load(fh)
    out: dict[str, list[str]] = {}
    for rule in cfg.get("redirects", []):
        dest = rule.get("destination", "")
        m = re.search(r"[?&]k=([^&]+)", dest)
        if not m:
            continue
        name = urllib.parse.unquote_plus(m.group(1)).strip()
        out.setdefault(name, []).append(rule.get("source", ""))
    return out


def tokens(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    return {w for w in words if w not in NOISE and len(w) > 1}


def brand_of(name: str) -> list[str]:
    """Eerste twee betekenisvolle woorden = merk, ruw maar bruikbaar."""
    words = [w for w in re.findall(r"[a-z0-9&]+", name.lower()) if w not in NOISE]
    return words[:2]


def lookup(keyword: str, auth: str) -> list[dict]:
    body = json.dumps([{
        "keyword": keyword,
        "language_code": "en_US",
        "location_name": "United States",
    }]).encode()
    req = urllib.request.Request(
        API, data=body,
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = json.load(resp)
    task = data["tasks"][0]
    if task.get("status_code") != 20000 or not task.get("result"):
        return []
    return task["result"][0].get("items") or []


def product_path(url: str) -> str:
    """Alleen het product-slugdeel van een Amazon-URL.

    KRITIEK: de volledige resultaat-URL bevat de zoekterm terug in `keywords=`,
    dus die meenemen betekent de query tegen zichzelf matchen — alles scoort dan
    1.0 en elk product lijkt gevonden. Sponsored links (/sspa/click) verbergen het
    echte pad bovendien in een `url=`-parameter.
    """
    if not url:
        return ""
    parsed = urllib.parse.urlparse(url)
    if "/sspa/click" in parsed.path:
        inner = urllib.parse.parse_qs(parsed.query).get("url", [""])[0]
        parsed = urllib.parse.urlparse(urllib.parse.unquote(inner))
    path = parsed.path
    # Alles vanaf /dp/ of /ref= is ruis (ASIN, tracking-segmenten).
    path = re.split(r"/(dp|gp|ref=)", path)[0]
    return path.replace("-", " ").replace("/", " ")


def score(name: str, item: dict) -> tuple[float, bool]:
    """Overlap-score plus of het merk voorkomt.

    Amazon zet het merk lang niet altijd in de titel (een Bedsure-dekbed heet
    'Comforter Duvet Insert - Quilted...'), maar wél in de URL-slug. Daarom
    zoeken we in titel én product-slug — maar nadrukkelijk NIET in de querystring.
    """
    haystack = f"{item.get('title', '')} {product_path(item.get('url', ''))}"
    hay = tokens(haystack)
    want = tokens(name)
    if not want:
        return 0.0, False
    overlap = len(want & hay) / len(want)
    brand_hit = all(b in haystack.lower() for b in brand_of(name))
    return overlap, brand_hit


# Producttypes, langste eerst — "comforter set" is iets anders dan "comforter",
# en "duvet cover" iets heel anders dan "duvet insert". Zonder deze poort matcht
# een gevraagde comforter vrolijk op een dekbedovertrek van hetzelfde merk.
TYPES = [
    "bed in a bag", "duvet cover", "duvet insert", "comforter set",
    "mattress topper", "pillow protector", "pillow case", "pillowcase",
    "sheet set", "body pillow", "wedge pillow", "comforter", "duvet",
    "pillow", "blanket", "quilt", "topper", "protector",
]


def type_of(text: str) -> str | None:
    low = re.sub(r"[^a-z ]", " ", text.lower())
    low = re.sub(r"\s+", " ", low)
    for t in TYPES:
        if t in low:
            return t
    return None


def classify(name: str, items: list[dict]) -> dict:
    want = type_of(name)
    best, best_score, best_brand = None, 0.0, False
    for item in items:
        if not item.get("data_asin"):
            continue
        sc, brand = score(name, item)
        cand_type = type_of(f"{item.get('title', '')} {product_path(item.get('url', ''))}")
        # Merktreffer en juist producttype wegen zwaarder dan losse woordoverlap,
        # zodat een type-correcte kandidaat wint van een type-verkeerde.
        weighted = sc + (0.35 if brand else 0.0) + (0.30 if want and want == cand_type else 0.0)
        if weighted > best_score:
            best, best_score, best_brand = item, weighted, brand
            best.setdefault("_overlap", sc)

    if best is None:
        return {"verdict": "NOT_FOUND", "reason": "geen enkel resultaat met ASIN"}

    overlap = best.get("_overlap", 0.0)

    # Typepoort: het gevonden product moet hetzelfde soort ding zijn.
    want_type = type_of(name)
    got_type = type_of(f"{best.get('title', '')} {product_path(best.get('url', ''))}")
    type_ok = want_type is None or want_type == got_type

    if best_brand and overlap >= 0.5 and type_ok:
        verdict, reason = "FOUND", "merk + type + sterke woordoverlap"
    elif best_brand and not type_ok:
        verdict = "REVIEW"
        reason = f"merk klopt maar type wijkt af: gevraagd '{want_type}', gevonden '{got_type}'"
    elif best_brand and overlap >= 0.3:
        verdict, reason = "REVIEW", "merk gevonden, matige overlap"
    elif overlap >= 0.7 and type_ok:
        verdict, reason = "REVIEW", "sterke overlap maar merk niet herkend"
    else:
        verdict, reason = "NOT_FOUND", "geen merktreffer, zwakke overlap"

    return {
        "verdict": verdict,
        "reason": reason,
        "asin": best.get("data_asin", ""),
        "matched_title": (best.get("title") or "")[:150],
        "overlap": round(overlap, 2),
        "want_type": want_type or "",
        "got_type": got_type or "",
        "sponsored": best.get("type") == "amazon_paid",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("vercel_json")
    ap.add_argument("--out", required=True)
    ap.add_argument("--limit", type=int, default=0, help="alleen de eerste N producten")
    ap.add_argument("--workers", type=int, default=5)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    cache_path = os.path.join(args.out, "cache.json")
    cache = {}
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as fh:
            cache = json.load(fh)

    products = extract_products(args.vercel_json)
    names = sorted(products)
    if args.limit:
        names = names[: args.limit]

    todo = [n for n in names if n not in cache]
    print(f"{len(products)} unieke producten, {len(names)} in scope, {len(todo)} nog op te zoeken")
    print(f"geschatte kosten: ${len(todo) * COST_PER_CALL:.2f}")

    auth = auth_header()
    lock = Lock()
    done = [0]

    def work(name: str) -> None:
        try:
            items = lookup(name, auth)
            result = classify(name, items)
        except Exception as exc:  # netwerk/API-fout: markeer, niet stilzwijgend overslaan
            result = {"verdict": "ERROR", "reason": f"{type(exc).__name__}: {exc}"}
        with lock:
            cache[name] = result
            done[0] += 1
            if done[0] % 10 == 0 or done[0] == len(todo):
                print(f"  {done[0]}/{len(todo)}")
                with open(cache_path, "w", encoding="utf-8") as fh:
                    json.dump(cache, fh, ensure_ascii=False, indent=1)

    if todo:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            list(pool.map(work, todo))
    with open(cache_path, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, ensure_ascii=False, indent=1)

    csv_path = os.path.join(args.out, "triage.csv")
    counts: dict[str, int] = {}
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["verdict", "product", "asin", "overlap", "want_type", "got_type",
                    "sponsored", "reason", "matched_title", "n_slugs", "example_slug"])
        for name in names:
            r = cache.get(name, {})
            v = r.get("verdict", "MISSING")
            counts[v] = counts.get(v, 0) + 1
            slugs = products[name]
            w.writerow([v, name, r.get("asin", ""), r.get("overlap", ""),
                        r.get("want_type", ""), r.get("got_type", ""),
                        "ja" if r.get("sponsored") else "", r.get("reason", ""),
                        r.get("matched_title", ""), len(slugs), slugs[0] if slugs else ""])

    print(f"\ngeschreven: {csv_path}")
    for v in ("FOUND", "REVIEW", "NOT_FOUND", "ERROR", "MISSING"):
        if counts.get(v):
            print(f"  {v:<10} {counts[v]}")
    print("\nFOUND    -> omzetten naar /dp/<ASIN>")
    print("REVIEW   -> handmatig nakijken, niet automatisch omzetten")
    print("NOT_FOUND-> link verwijderen; product bestaat niet op Amazon")
    return 0


if __name__ == "__main__":
    sys.exit(main())
