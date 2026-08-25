#!/usr/bin/env python3
"""Voegt de agent-oordelen over alternatieven samen en vist de twijfelgevallen eruit.

Elke agent ziet maar tien producten. Wat hij niet kan zien is of zijn collega
dezelfde afweging andersom maakte, of dezelfde ASIN al aan een andere pagina gaf.
Dit script legt de batches naast elkaar en signaleert drie dingen:

  dubbele ASIN     hetzelfde alternatief bij meerdere producten — kan prima,
                   maar moet een keuze zijn, geen toeval
  inconsistent     dezelfde ASIN in de ene batch geaccepteerd en in de andere
                   afgewezen, of bijna identieke producten met andere uitkomst
  grensgeval       weinig reviews of een sponsored treffer

Alles wat in die drie bakken valt gaat naar review-nodig.csv en wordt NIET
automatisch toegepast. De rest komt in toe-te-passen.csv.
"""

from __future__ import annotations

import csv
import glob
import json
import os
import re
import sys
from collections import defaultdict

MIN_REVIEWS = 500


def norm(name: str) -> str:
    """Ruwe normalisatie om bijna-identieke productnamen te herkennen."""
    words = re.findall(r"[a-z0-9]+", name.lower())
    stop = {"the", "and", "a", "an", "of", "for", "with", "size", "queen", "king"}
    return " ".join(sorted(w for w in words if w not in stop))


def main() -> int:
    base = "out/alternatives"
    verdicts = []
    for path in sorted(glob.glob(f"{base}/alt-verdict-*.json")):
        batch = os.path.basename(path)
        with open(path, encoding="utf-8") as fh:
            for row in json.load(fh):
                row["_batch"] = batch
                verdicts.append(row)
    print(f"{len(verdicts)} oordelen uit {len(glob.glob(f'{base}/alt-verdict-*.json'))} batches")

    # Kandidaatgegevens erbij halen voor reviewaantal en sponsored-status
    kandidaat_info: dict[tuple[str, str], dict] = {}
    for path in sorted(glob.glob(f"{base}/alt-batch-*.json")):
        with open(path, encoding="utf-8") as fh:
            for item in json.load(fh):
                for cand in item["kandidaten"]:
                    kandidaat_info[(item["origineel_product"], cand["asin"])] = cand

    gebruikt = defaultdict(list)          # asin -> producten die hem gebruiken
    per_asin_besluit = defaultdict(set)   # asin -> {USE_ALTERNATIVE, NONE}
    per_norm = defaultdict(list)          # genormaliseerde naam -> rijen

    for row in verdicts:
        per_norm[norm(row["origineel_product"])].append(row)
        if row["decision"] == "USE_ALTERNATIVE" and row.get("asin"):
            gebruikt[row["asin"]].append(row["origineel_product"])
        # Was deze ASIN elders wel/niet gekozen?
        for (prod, asin) in kandidaat_info:
            if prod == row["origineel_product"]:
                if asin == row.get("asin"):
                    per_asin_besluit[asin].add("USE_ALTERNATIVE")
                elif row["decision"] == "NONE":
                    per_asin_besluit[asin].add("NONE-beschikbaar")

    toepassen, nodig = [], []
    for row in verdicts:
        redenen = []
        asin = row.get("asin", "")
        if row["decision"] == "USE_ALTERNATIVE":
            if not re.fullmatch(r"[A-Z0-9]{10}", asin):
                redenen.append("ongeldige ASIN")
            info = kandidaat_info.get((row["origineel_product"], asin))
            if info is None:
                redenen.append("ASIN staat niet in de eigen kandidatenlijst")
            else:
                if (info.get("reviews") or 0) < MIN_REVIEWS:
                    redenen.append(f"maar {info.get('reviews')} reviews")
                if info.get("sponsored"):
                    redenen.append("sponsored treffer")
            if len(gebruikt.get(asin, [])) > 1:
                anderen = [p for p in gebruikt[asin] if p != row["origineel_product"]]
                redenen.append(f"zelfde ASIN ook bij: {'; '.join(anderen)[:70]}")
        # bijna-identieke producten met een ander besluit
        zelfde = per_norm[norm(row["origineel_product"])]
        if len({(r["decision"], r.get("asin", "")) for r in zelfde}) > 1:
            redenen.append("bijna identiek product kreeg een ander besluit")

        record = {
            "site": row["site"],
            "origineel_product": row["origineel_product"],
            "decision": row["decision"],
            "asin": asin,
            "alternatief_naam": row.get("alternatief_naam", ""),
            "reason": row.get("reason", ""),
            "batch": row["_batch"],
            "aandacht": " | ".join(redenen),
        }
        (nodig if redenen else toepassen).append(record)

    os.makedirs("out", exist_ok=True)
    velden = ["site", "origineel_product", "decision", "asin", "alternatief_naam",
              "reason", "batch", "aandacht"]
    for naam, rows in (("out/alt-toe-te-passen.csv", toepassen),
                       ("out/alt-review-nodig.csv", nodig)):
        with open(naam, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=velden)
            w.writeheader()
            w.writerows(rows)

    n_use = sum(1 for r in toepassen if r["decision"] == "USE_ALTERNATIVE")
    print(f"\nzonder bezwaar : {len(toepassen)}  (waarvan {n_use} met alternatief)")
    print(f"review nodig   : {len(nodig)}")
    for r in nodig[:12]:
        print(f"  {r['origineel_product'][:42]:<42} {r['decision']:<16} {r['aandacht'][:60]}")
    if len(nodig) > 12:
        print(f"  ... en nog {len(nodig) - 12}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
