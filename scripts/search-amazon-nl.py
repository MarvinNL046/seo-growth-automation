#!/usr/bin/env python3
"""Zoekt producten op amazon.nl en geeft de Nederlandse ASIN-kandidaten terug.

Waarom dit naast asin-triage.py bestaat: dat script zoekt op amazon.**com**. Voor
Nederlandse lezers is dat de verkeerde catalogus. Amazons Global Earning stuurt een
NL-klik op een .com-link door naar amazon.nl, en staat het artikel daar niet, dan
belandt de lezer op een zoekpagina in plaats van op het product. Zie
measure-nl-redirects.py voor die meting; dit script zoekt de vervangers erbij.

Twee dingen die je moet weten voordat je de uitkomst gebruikt:

1. ASIN's zijn marktplaats-specifiek. Een ASIN die je hier vindt werkt NIET in een
   amazon.com-link — dat wordt een dode link. De NL-ASIN is alleen bruikbaar in een
   amazon.nl-link, met een tag die op .nl geldig is.

2. In de catalogus staan is geen bewijs dat Global Earning het product vindt.
   Gemeten 28 aug 2026: B08J54C2Y8 (My Brest Friend Deluxe) staat mét dezelfde ASIN
   op amazon.nl, en viel bij een echte klik tóch terug op de zoekpagina. Behandel de
   uitkomst als SIGNAAL en valideer elke swap met een echte klik.

Merken die DTC verkopen (Emma, Silvana, Cabeau) staan vaak in geen van beide
catalogi. Een leeg resultaat is dus een geldig antwoord, geen fout.

Resultaten worden gecachet in <out>/cache.json, dus een herstart kost niets extra.

Gebruik:
    python scripts/search-amazon-nl.py "ComfiLife kniekussen" "doomoo Buddy voedingskussen"
    python scripts/search-amazon-nl.py --queries zoektermen.txt --out out/nl-asins
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request

API = "https://api.dataforseo.com/v3/merchant/amazon/products/live/advanced"
COST_PER_CALL = 0.0033


def auth_header() -> str:
    """Haalt de DataForSEO Basic-auth op uit env of uit de MCP-config."""
    if os.environ.get("DFS_AUTH"):
        return os.environ["DFS_AUTH"]
    cfg = os.path.expanduser("~/.claude.json")
    with open(cfg, encoding="utf-8") as fh:
        data = json.load(fh)
    hdr = data["mcpServers"]["dfs-mcp"]["headers"]["Authorization"]
    return hdr.removeprefix("Basic ").strip()


def lookup(keyword: str, auth: str) -> list[dict]:
    """Ruwe SERP-items van amazon.nl voor één zoekterm."""
    body = json.dumps([{
        "keyword": keyword,
        "language_code": "nl_NL",
        "location_name": "Netherlands",
    }]).encode()
    req = urllib.request.Request(API, data=body, headers={
        "Authorization": "Basic " + auth,
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.load(resp)

    task = data["tasks"][0]
    if task.get("status_code") != 20000:
        raise RuntimeError(task.get("status_message", "onbekende DataForSEO-fout"))
    result = (task.get("result") or [{}])[0]
    return [it for it in (result.get("items") or []) if it.get("type") == "amazon_serp"]


def condense(items: list[dict], top: int) -> list[dict]:
    """Alleen de velden die je nodig hebt om een ASIN te beoordelen."""
    rows = []
    for it in items[:top]:
        rating = it.get("rating") or {}
        rows.append({
            "asin": it.get("data_asin") or it.get("asin"),
            "titel": it.get("title") or "",
            "prijs": it.get("price_from"),
            "rating": rating.get("value"),
            "reviews": rating.get("votes_count"),
            "url": f"https://www.amazon.nl/dp/{it.get('data_asin') or it.get('asin')}",
        })
    return rows


def main() -> int:
    # Windows-console valt terug op cp1252 en verminkt dan Nederlandse titels.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser()
    ap.add_argument("keywords", nargs="*", help="zoektermen, in het Nederlands")
    ap.add_argument("--queries", help="bestand met één zoekterm per regel")
    ap.add_argument("--out", help="map voor resultaten.json en cache.json")
    ap.add_argument("--top", type=int, default=8, help="aantal resultaten per zoekterm")
    ap.add_argument("--refresh", action="store_true", help="cache negeren en opnieuw ophalen")
    args = ap.parse_args()

    keywords = list(args.keywords)
    if args.queries:
        with open(args.queries, encoding="utf-8") as fh:
            keywords += [ln.strip() for ln in fh if ln.strip() and not ln.startswith("#")]
    if not keywords:
        ap.error("geef zoektermen op, of --queries met een bestand")

    cache: dict[str, list[dict]] = {}
    cache_path = None
    if args.out:
        os.makedirs(args.out, exist_ok=True)
        cache_path = os.path.join(args.out, "cache.json")
        if os.path.exists(cache_path) and not args.refresh:
            with open(cache_path, encoding="utf-8") as fh:
                cache = json.load(fh)

    todo = [k for k in keywords if k not in cache]
    print(f"{len(keywords)} zoektermen, {len(todo)} nog op te halen "
          f"(geschatte kosten: ${len(todo) * COST_PER_CALL:.2f})")

    auth = auth_header() if todo else ""
    results: dict[str, list[dict]] = {}
    for kw in keywords:
        if kw in cache:
            items = cache[kw]
        else:
            try:
                items = lookup(kw, auth)
            except Exception as exc:  # noqa: BLE001 - fout per zoekterm mag de rest niet slopen
                print(f"\n### {kw}\n  FOUT: {exc}")
                continue
            cache[kw] = items
        rows = condense(items, args.top)
        results[kw] = rows

        print(f"\n### {kw}")
        if not rows:
            print("  geen resultaten — product staat waarschijnlijk niet op amazon.nl")
        for r in rows:
            prijs = f"EUR {r['prijs']}" if r["prijs"] is not None else "geen prijs"
            print(f"  {r['asin']} | {r['titel'][:80]} | {prijs} | "
                  f"{r['rating']} ({r['reviews']})")

    if args.out:
        with open(cache_path, "w", encoding="utf-8") as fh:
            json.dump(cache, fh, ensure_ascii=False)
        out_path = os.path.join(args.out, "resultaten.json")
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(results, fh, ensure_ascii=False, indent=2)
        print(f"\ngeschreven: {out_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
