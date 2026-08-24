#!/usr/bin/env python3
"""Controleert of ASIN's op Nederlandstalige pagina's ook op amazon.nl bestaan.

Waarom dit nodig is: Amazons Global Earning stuurt een Nederlandse bezoeker van
een US-link door naar amazon.nl. Bestaat het artikel daar, dan landt hij netjes
op de productpagina mét de tag intact. Bestaat het daar NIET, dan valt Amazon
terug op een verouderd zoek-URL-formaat dat amazon.nl afwijst:

    amazon.com/dp/<ASIN>?tag=...  ->  amazon.nl/s/?ie=UTF8&url=search-alias=aps&...  ->  HTTP 400

De bezoeker krijgt dus een foutpagina in plaats van een alternatief. Dat is niet
met een andere link-opmaak te repareren — `ref=nosim` weglaten helpt niet, het is
Amazons eigen terugval die stuk is. De enige oplossing is: gebruik op NL-pagina's
alleen ASIN's die daar bestaan.

Er wordt via DataForSEO gemeten en niet met curl: Amazon throttelt na een handvol
snelle verzoeken, en die fout (`http=000`) is niet te onderscheiden van een
ontbrekend product.

⚠️ BELANGRIJKE BEPERKING — gemeten 24 aug 2026.
Dit script beantwoordt "staat deze ASIN in de catalogus van amazon.nl?". Dat is
NIET hetzelfde als "vindt Global Earning hem daar". Drie ASIN's die hier als
beschikbaar uit kwamen, landden bij een echte klik alsnog op de zoek-terugval in
plaats van op de productpagina. Gebruik de uitkomst dus als SIGNAAL, niet als
bewijs, en valideer een fix altijd met een echte klik voordat je hem uitrolt.

De enige betrouwbare meting is de redirect zelf volgen vanuit Nederland:

    curl -s -o /dev/null -w "%{http_code} %{url_effective}" -L "https://www.amazon.com/dp/<ASIN>?tag=<tag>"

Landt hij op `/dp/` = goed. Op `/s/?ie=UTF8&url=search-alias=aps` = het product is
er niet en de lezer krijgt een zoekpagina of een 400. Pace dit: na ongeveer tien
snelle verzoeken blokkeert Amazon en krijg je alleen nog 000.

Gebruik:
    python scripts/check-nl-availability.py <paren.json> --out out/nl-availability.json

waarbij paren.json een lijst [[slug, asin], ...] is.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

API = "https://api.dataforseo.com/v3/merchant/amazon/asin/live/advanced"
COST_PER_CALL = 0.005


def auth_header() -> str:
    if os.environ.get("DFS_AUTH"):
        return os.environ["DFS_AUTH"]
    with open(os.path.expanduser("~/.claude.json"), encoding="utf-8") as fh:
        data = json.load(fh)
    return data["mcpServers"]["dfs-mcp"]["headers"]["Authorization"].removeprefix("Basic ").strip()


def on_nl(asin: str, auth: str) -> dict:
    body = json.dumps([{
        "asin": asin,
        "language_code": "nl_NL",
        "location_name": "Netherlands",
    }]).encode()
    req = urllib.request.Request(
        API, data=body,
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.load(resp)
    task = data["tasks"][0]
    if task.get("status_code") != 20000:
        return {"nl": False, "why": f"task {task.get('status_code')}"}
    items = ((task.get("result") or [{}])[0].get("items")) or []
    if not items:
        return {"nl": False, "why": "geen productgegevens op amazon.nl"}
    return {"nl": True, "title": (items[0].get("title") or "")[:110]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paren")
    ap.add_argument("--out", default="out/nl-availability.json")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    paren = json.load(open(args.paren, encoding="utf-8"))
    asins = sorted({a for _, a in paren})
    cache = json.load(open(args.out, encoding="utf-8")) if os.path.exists(args.out) else {}
    todo = [a for a in asins if a not in cache]
    print(f"{len(asins)} unieke ASIN's op NL-pagina's, {len(todo)} te controleren "
          f"(${len(todo) * COST_PER_CALL:.2f})")

    auth = auth_header()
    lock, done = Lock(), [0]

    def work(asin: str) -> None:
        try:
            res = on_nl(asin, auth)
        except Exception as exc:
            res = {"nl": None, "why": type(exc).__name__}
        with lock:
            cache[asin] = res
            done[0] += 1
            if done[0] % 10 == 0 or done[0] == len(todo):
                print(f"  {done[0]}/{len(todo)}")
                json.dump(cache, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    if todo:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            list(pool.map(work, todo))
    json.dump(cache, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    ontbreekt = [a for a in asins if cache.get(a, {}).get("nl") is False]
    onbekend = [a for a in asins if cache.get(a, {}).get("nl") is None]
    print(f"\nop amazon.nl : {len(asins) - len(ontbreekt) - len(onbekend)}")
    print(f"NIET op .nl  : {len(ontbreekt)}   <- deze geven een 400 voor Nederlandse bezoekers")
    print(f"onbekend     : {len(onbekend)}")
    for slug, asin in paren:
        if asin in ontbreekt:
            print(f"  {slug[:56]:<56} {asin}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
