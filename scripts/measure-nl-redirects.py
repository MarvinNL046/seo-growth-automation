#!/usr/bin/env python3
"""Meet wat een Nederlandse bezoeker écht krijgt als hij op een US-affiliate-link klikt.

Amazons Global Earning stuurt een NL-klik door naar amazon.nl. Staat het artikel
daar, dan landt de bezoeker op de productpagina met de tag intact. Staat het er
niet, dan valt Amazon terug op een verouderd zoek-URL-formaat dat soms een
zoekpagina toont en soms met HTTP 400 stukloopt.

Dit script volgt die redirect echt, want dat is de enige betrouwbare meting. Een
catalogus-lookup via DataForSEO voorspelt het gedrag NIET: drie ASIN's die daar
als beschikbaar uitkwamen, landden bij een echte klik alsnog op de terugval.

WAAROM DIT VERSPREID OVER DAGEN MOET
Amazon blokkeert na ongeveer tien snelle verzoeken en geeft dan alleen nog
`000` — niet te onderscheiden van een echte fout. Alles in één keer meten levert
dus geen data maar ruis op. Daarom: een klein aantal per dag, met pauzes, en
stoppen zodra de blokkade intreedt.

Gebruik:
    python scripts/measure-nl-redirects.py --repo ../thepillowadvisor --per-run 10
    python scripts/measure-nl-redirects.py --repo ../thepillowadvisor --report
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
PAUZE = 7          # seconden tussen verzoeken
BLOKKADE_STOP = 2  # zoveel keer 000 achter elkaar en we kappen ermee


def arr_from(path: str, marker: str):
    """Leest een JSON-array uit een gegenereerd TypeScript-bestand."""
    src = open(path, encoding="utf-8").read()
    i = src.index(marker)
    i = src.index("[", i)
    depth = 0
    for k in range(i, len(src)):
        if src[k] == "[":
            depth += 1
        elif src[k] == "]":
            depth -= 1
            if depth == 0:
                return json.loads(src[i:k + 1])
    raise ValueError(f"geen sluitend haakje in {path}")


def nl_asins(repo: str) -> list[tuple[str, str]]:
    """(slug, asin) voor elk product dat op een Nederlandstalige pagina staat."""
    prods = {p["slug"]: p for p in arr_from(
        os.path.join(repo, "content/affiliate-registry.generated.ts"), "affiliateProducts")}
    db = arr_from(os.path.join(repo, "content/product-database.generated.ts"), "productDatabase")
    out = []
    for p in db:
        if "NL" not in p.get("markets", []):
            continue
        asin = prods.get(p["slug"], {}).get("asin")
        if asin:
            out.append((p["slug"], asin))
    return out


def tag_of(repo: str) -> str:
    src = open(os.path.join(repo, "scripts/sync-affiliate-registry.mjs"), encoding="utf-8").read()
    m = re.search(r'amazonTag\s*=\s*"([^"]+)"', src)
    return m.group(1) if m else "thepillowadvisor-20"


def meet(asin: str, tag: str) -> dict:
    url = f"https://www.amazon.com/dp/{asin}?tag={tag}"
    proc = subprocess.run(
        ["curl", "-s", "-o", os.devnull, "-w", "%{http_code}|%{url_effective}",
         "-L", "-A", UA, "--max-time", "30", url],
        capture_output=True, text=True,
    )
    code, _, eind = proc.stdout.partition("|")
    if code == "000":
        soort = "geblokkeerd"
    elif code == "400":
        soort = "kapot"
    elif "/dp/" in eind:
        soort = "productpagina"
    elif "/s/" in eind or "/s?" in eind:
        soort = "zoekpagina"
    else:
        soort = f"anders-{code}"
    return {"http": code, "eind": eind[:160], "soort": soort,
            "gemeten": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")}


def rapport(data: dict, paren: list[tuple[str, str]]) -> None:
    per_asin = {a: data[a] for _, a in paren if a in data}
    tel: dict[str, int] = {}
    for v in per_asin.values():
        tel[v["soort"]] = tel.get(v["soort"], 0) + 1
    print(f"\ngemeten: {len(per_asin)} van {len({a for _, a in paren})} ASIN's op NL-pagina's")
    for soort in ("productpagina", "zoekpagina", "kapot", "geblokkeerd"):
        if tel.get(soort):
            print(f"  {soort:<14} {tel[soort]}")
    for soort in sorted(k for k in tel if k.startswith("anders")):
        print(f"  {soort:<14} {tel[soort]}")

    stuk = [(s, a) for s, a in paren if per_asin.get(a, {}).get("soort") in ("kapot", "zoekpagina")]
    if stuk:
        print("\nlinks die de Nederlandse lezer niet op het product afleveren:")
        for slug, asin in stuk:
            print(f"  {per_asin[asin]['soort']:<14} {slug[:52]:<52} {asin}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--out", default="out/nl-redirect-metingen.json")
    ap.add_argument("--per-run", type=int, default=10)
    ap.add_argument("--report", action="store_true", help="alleen rapporteren, niets meten")
    args = ap.parse_args()

    paren = nl_asins(args.repo)
    tag = tag_of(args.repo)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    data = json.load(open(args.out, encoding="utf-8")) if os.path.exists(args.out) else {}

    if args.report:
        rapport(data, paren)
        return 0

    # Nog nooit gemeten eerst; daarna wat het langst geleden is.
    alle = sorted({a for _, a in paren})
    nieuw = [a for a in alle if a not in data]
    oud = sorted((a for a in alle if a in data), key=lambda a: data[a].get("gemeten", ""))
    volgorde = (nieuw + oud)[: args.per_run]

    print(f"{len(alle)} ASIN's op NL-pagina's · {len(nieuw)} nog nooit gemeten · "
          f"deze run: {len(volgorde)} (pauze {PAUZE}s)")

    blokkades = 0
    for i, asin in enumerate(volgorde, 1):
        res = meet(asin, tag)
        if res["soort"] == "geblokkeerd":
            blokkades += 1
            print(f"  {i}/{len(volgorde)} {asin} geblokkeerd door Amazon — niet opgeslagen")
            if blokkades >= BLOKKADE_STOP:
                print("  twee blokkades achter elkaar; gestopt. De rest volgt morgen.")
                break
        else:
            blokkades = 0
            data[asin] = res
            print(f"  {i}/{len(volgorde)} {asin} {res['soort']}")
        json.dump(data, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        if i < len(volgorde):
            time.sleep(PAUZE)

    rapport(data, paren)
    return 0


if __name__ == "__main__":
    sys.exit(main())
