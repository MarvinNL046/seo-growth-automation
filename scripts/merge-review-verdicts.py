#!/usr/bin/env python3
"""Voegt de agent-oordelen over de REVIEW-stapel samen tot één besluitenlijst.

Een hercheck-oordeel overschrijft altijd het eerste oordeel: de eerste ronde zag
maar acht kandidaten per product, terwijl sommige zoekopdrachten er honderd
opleverden en het juiste product soms op positie 25 stond.

Schrijft:
  out/review-decisions.csv   alle besluiten, met herkomst
  out/review-use-asin.csv    alleen de USE_ASIN-regels, in het formaat dat
                             apply-asin-conversions.py verwacht (kolom `verdict`
                             = FOUND, zodat dezelfde applier hergebruikt wordt)
"""

from __future__ import annotations

import csv
import glob
import json
import os
import re
import sys

ASIN_RE = re.compile(r"^[A-Z0-9]{10}$")


def load(pattern: str) -> dict[tuple[str, str], dict]:
    out: dict[tuple[str, str], dict] = {}
    for path in sorted(glob.glob(pattern)):
        with open(path, encoding="utf-8") as fh:
            for row in json.load(fh):
                out[(row["site"], row["product"])] = row
    return out


def main() -> int:
    base = "out/review-batches"
    first = load(f"{base}/verdict-*.json")
    recheck = load(f"{base}/recheck-verdict-*.json")

    # Alleen de sleutels die ook in de eerste ronde zaten; een hercheck mag niets toevoegen.
    onbekend = set(recheck) - set(first)
    if onbekend:
        print(f"WAARSCHUWING: {len(onbekend)} hercheck-regels horen bij geen enkel eerste oordeel")
        for k in list(onbekend)[:5]:
            print(f"   {k}")

    decisions = {}
    veranderd = []
    for key, row in first.items():
        final = dict(row)
        final["herkomst"] = "eerste ronde"
        if key in recheck:
            r = recheck[key]
            final = dict(r)
            final["herkomst"] = "hercheck"
            if r["decision"] != row["decision"] or r.get("asin") != row.get("asin"):
                veranderd.append((key, row["decision"], r["decision"], r.get("asin", "")))
        decisions[key] = final

    # Sanity: geen verzonnen ASIN's
    fout = [k for k, v in decisions.items()
            if v["decision"] == "USE_ASIN" and not ASIN_RE.match(v.get("asin", ""))]
    if fout:
        print(f"FOUT: {len(fout)} USE_ASIN-regels zonder geldige ASIN — niet toepassen")
        for k in fout:
            print(f"   {k}: {decisions[k].get('asin')!r}")
        return 1

    os.makedirs("out", exist_ok=True)
    with open("out/review-decisions.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["site", "product", "decision", "asin", "herkomst", "reason"])
        for (site, product), v in sorted(decisions.items()):
            w.writerow([site, product, v["decision"], v.get("asin", ""),
                        v["herkomst"], v.get("reason", "")])

    # Formaat dat apply-asin-conversions.py leest
    with open("out/review-use-asin.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["verdict", "product", "asin", "site"])
        for (site, product), v in sorted(decisions.items()):
            if v["decision"] == "USE_ASIN":
                w.writerow(["FOUND", product, v["asin"], site])

    n_use = sum(1 for v in decisions.values() if v["decision"] == "USE_ASIN")
    print(f"besluiten      : {len(decisions)}")
    print(f"  USE_ASIN     : {n_use}")
    print(f"  REMOVE       : {len(decisions) - n_use}")
    print(f"herbeoordeeld  : {len(recheck)}")
    print(f"  van oordeel veranderd: {len(veranderd)}")
    for (site, product), oud, nieuw, asin in veranderd:
        print(f"    {site:<7} {product[:46]:<46} {oud} -> {nieuw} {asin}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
