#!/usr/bin/env python3
"""Past de herschreven, prijsloze zinnen toe op de content van de advisor-sites.

Amazon Associates staat geen prijzen toe buiten de Product Advertising API. Het
priceRange-veld is al verwijderd; dit script pakt de bedragen aan die middenin
redactionele zinnen stonden (pros/cons, FAQ-antwoorden, bestFor).

Het vervangt letterlijke strings en faalt hard als een origineel niet gevonden
wordt. Een vervanging die stil overslaat laat het bedrag gewoon staan, en dat
merk je pas op de live site.

Gebruik:
    python scripts/apply-price-rewrites.py --dry-run
    python scripts/apply-price-rewrites.py
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys

ROOT = r"C:\Users\M_Smi\Projecten"
REPOS = ("theduvetadvisor", "thepillowadvisor")
PRIJS = re.compile(r"\$\s?[0-9][0-9,.]*|€\s?[0-9][0-9,.]*")


def escape_for_ts(value: str) -> str:
    """De strings staan in TypeScript-bronbestanden met dubbele quotes."""
    return value.replace("\\", "\\\\").replace('"', '\\"')


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    rewrites: dict[str, str] = {}
    for path in sorted(glob.glob("out/prijs-verdict-*.json")):
        for row in json.load(open(path, encoding="utf-8")):
            rewrites[row["origineel"]] = row["nieuw"]
    print(f"{len(rewrites)} herschreven zinnen ingelezen")

    # Weigert een 'nieuw' waar nog een bedrag in staat.
    besmet = {o: n for o, n in rewrites.items() if PRIJS.search(n)}
    if besmet:
        print(f"FOUT: {len(besmet)} herschreven zinnen bevatten nog een bedrag:")
        for o, n in list(besmet.items())[:5]:
            print(f"  {n[:90]}")
        return 1

    toegepast = 0
    niet_gevonden = list(rewrites)
    for repo in REPOS:
        for dirpath, _, files in os.walk(os.path.join(ROOT, repo, "content")):
            for fn in files:
                if not fn.endswith(".ts") or "generated" in fn:
                    continue
                path = os.path.join(dirpath, fn)
                src = open(path, encoding="utf-8").read()
                nieuw_src = src
                for origineel, vervanging in rewrites.items():
                    naald = escape_for_ts(origineel)
                    if naald not in nieuw_src:
                        continue
                    n = nieuw_src.count(naald)
                    nieuw_src = nieuw_src.replace(naald, escape_for_ts(vervanging))
                    toegepast += n
                    if origineel in niet_gevonden:
                        niet_gevonden.remove(origineel)
                if nieuw_src != src and not args.dry_run:
                    open(path, "w", encoding="utf-8").write(nieuw_src)

    print(f"vervangingen toegepast: {toegepast}")
    if niet_gevonden:
        print(f"FOUT: {len(niet_gevonden)} originelen nergens gevonden — niets weggeschreven:")
        for o in niet_gevonden[:5]:
            print(f"  {o[:90]}")
        return 1
    if args.dry_run:
        print("--dry-run: niets weggeschreven")
    return 0


if __name__ == "__main__":
    sys.exit(main())
