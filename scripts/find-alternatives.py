#!/usr/bin/env python3
"""Zoekt vergelijkbare producten voor artikelen die niet op Amazon te koop zijn.

Voor elk product dat als `notOnAmazon` is gemarkeerd, zoekt dit script op de
CATEGORIE in plaats van op het merk — "Parachute Organic Cotton Puff Comforter"
wordt "organic cotton puff comforter". Wat je terugkrijgt zijn kandidaten die
mogelijk als "dichtstbijzijnde optie" kunnen dienen.

Het script beslist NIETS. Of iets een eerlijk alternatief is, is een redactioneel
oordeel: het gaat om een aanbeveling met jouw naam eronder. De uitvoer is een
batchbestand dat een mens of agent beoordeelt.

Gebruik:
    python scripts/find-alternatives.py --out out/alternatives
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

_spec = importlib.util.spec_from_file_location(
    "triage", os.path.join(os.path.dirname(__file__), "asin-triage.py"))
triage = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(triage)

COST_PER_CALL = 0.0033

# thepillowadvisor heeft Nederlandstalige pagina's die op amazon.com linkten.
# De categorie moet dus vertaald voordat je er iets zinnigs mee vindt.
NL_EN = {
    "hoofdkussen": "pillow", "kussen": "pillow", "nekkussen": "neck pillow",
    "hoofdkussens": "pillows", "kussens": "pillows", "traagschuim": "memory foam",
    "dekbed": "comforter", "matras": "mattress", "topper": "mattress topper",
    "zijslaper": "side sleeper", "rugslaper": "back sleeper", "buikslaper": "stomach sleeper",
    "beste": "best", "koelend": "cooling", "verstelbaar": "adjustable",
    "dons": "down", "veren": "feather", "latex": "latex", "hoes": "cover",
}


def category_query(name: str) -> str:
    """Haalt de merknaam eruit en houdt de productomschrijving over."""
    brand = set(triage.brand_of(name))
    words = re.findall(r"[A-Za-z0-9&+.]+", name)
    kept = [w for w in words if w.lower() not in brand]
    # Losse maatcodes zeggen niets over de categorie.
    kept = [w for w in kept if not re.fullmatch(r"[0-9]+([x×][0-9]+)?", w)]
    kept = [NL_EN.get(w.lower(), w) for w in kept]
    return " ".join(kept).strip() or name


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out/alternatives")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    cache_path = os.path.join(args.out, "cache.json")
    cache = json.load(open(cache_path, encoding="utf-8")) if os.path.exists(cache_path) else {}

    zonder = json.load(open("out/zonder-asin.json", encoding="utf-8"))
    targets = [(site, name) for site in zonder for name in zonder[site]]
    if args.limit:
        targets = targets[: args.limit]

    todo = [t for t in targets if f"{t[0]}|{t[1]}" not in cache]
    print(f"{len(targets)} producten zonder Amazon-link, {len(todo)} op te zoeken "
          f"(${len(todo) * COST_PER_CALL:.2f})")

    auth = triage.auth_header()
    lock, done = Lock(), [0]

    def work(target: tuple[str, str]) -> None:
        site, name = target
        query = category_query(name)
        try:
            items = triage.lookup(query, auth)
        except Exception as exc:
            items = []
            print(f"  fout bij {name[:40]}: {type(exc).__name__}")
        with lock:
            cache[f"{site}|{name}"] = {"category_query": query, "items": items}
            done[0] += 1
            if done[0] % 20 == 0 or done[0] == len(todo):
                print(f"  {done[0]}/{len(todo)}")
                json.dump(cache, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False)

    if todo:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            list(pool.map(work, todo))
    json.dump(cache, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False)

    # Batches voor beoordeling. Alleen organische treffers met genoeg reviews:
    # een alternatief aanbevelen dat zelf nauwelijks verkocht wordt, helpt niemand.
    batch: list[dict] = []
    for site, name in targets:
        entry = cache.get(f"{site}|{name}", {})
        cands = []
        seen: set[str] = set()
        for item in entry.get("items", []):
            asin = item.get("data_asin")
            if not asin or asin in seen:
                continue
            votes = (item.get("rating") or {}).get("votes_count") or 0
            if votes < 100:
                continue
            seen.add(asin)
            cands.append({
                "asin": asin,
                "title": (item.get("title") or "")[:170],
                "slug": triage.product_path(item.get("url", "")).strip()[:90],
                "reviews": votes,
                "bought_past_month": item.get("bought_past_month"),
                "sponsored": item.get("type") == "amazon_paid",
            })
            if len(cands) >= 8:
                break
        woorden = entry.get("category_query", "").split()
        te_generiek = len(woorden) < 2 or entry.get("category_query", "").strip().lower() in {
            "pillow", "comforter", "duvet", "blanket", "quilt", "pillows"
        }
        batch.append({
            "site": site,
            "origineel_product": name,
            "categorie_te_generiek": te_generiek,
            "waarschuwing": ("De productnaam levert alleen een kale categorie op. Een willekeurig "
                             "bestverkocht artikel is GEEN eerlijk alternatief voor een specifiek "
                             "merkproduct — kies hier alleen iets als het echt verdedigbaar is."
                             if te_generiek else ""),
            "reden_niet_op_amazon": zonder[site][name],
            "gezocht_op": entry.get("category_query", ""),
            "kandidaten": cands,
        })

    size = 10
    n = 0
    for i in range(0, len(batch), size):
        chunk = batch[i:i + size]
        path = os.path.join(args.out, f"alt-batch-{i // size + 1:02d}.json")
        json.dump(chunk, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        n += 1
    zonder_kandidaat = sum(1 for b in batch if not b["kandidaten"])
    print(f"\n{n} batches geschreven naar {args.out}")
    print(f"  producten zonder bruikbare kandidaat: {zonder_kandidaat}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
