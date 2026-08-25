#!/usr/bin/env python3
"""Zet FOUND-zoeklinks om naar directe ASIN-bestemmingen in vercel.json.

Leest de triage-uitslag en herschrijft alleen de redirects waarvan het product
op FOUND staat. REVIEW en NOT_FOUND blijven ongemoeid — die vragen een
redactionele beslissing, geen script.

De tag van elke redirect blijft behouden. Eén product hangt onder meerdere
tracking-ID's (tduvet-best-20, tduvet-blog-20, ...) en die scheiding is precies
hoe je straks ziet wélke sectie converteert.

Gebruik:
    python scripts/apply-asin-conversions.py out/duvet/triage.csv ../theduvetadvisor/vercel.json
    python scripts/apply-asin-conversions.py out/duvet/triage.csv ../theduvetadvisor/vercel.json --dry-run
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import urllib.parse
from collections import OrderedDict

# Zelfde vorm als de directe links die er al stonden.
TEMPLATE = "https://www.amazon.com/dp/{asin}/ref=nosim?tag={tag}"
ASIN_RE = re.compile(r"^[A-Z0-9]{10}$")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("triage_csv")
    ap.add_argument("vercel_json")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    # product-naam (lowercase) -> ASIN, alleen voor FOUND
    approved: dict[str, str] = {}
    skipped: dict[str, str] = {}
    with open(args.triage_csv, encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            name = row["product"].strip().lower()
            if row["verdict"] == "FOUND":
                asin = row["asin"].strip()
                if not ASIN_RE.match(asin):
                    print(f"OVERGESLAGEN, ongeldige ASIN {asin!r} bij {row['product']}")
                    continue
                approved[name] = asin
            else:
                skipped[name] = row["verdict"]

    with open(args.vercel_json, encoding="utf-8") as fh:
        cfg = json.load(fh, object_pairs_hook=OrderedDict)

    converted = 0
    left = {"REVIEW": 0, "NOT_FOUND": 0, "ONBEKEND": 0}
    per_tag: dict[str, int] = {}

    for rule in cfg.get("redirects", []):
        dest = rule.get("destination", "")
        m = re.search(r"[?&]k=([^&]+)", dest)
        if not m:
            continue  # al een directe ASIN
        name = urllib.parse.unquote_plus(m.group(1)).strip().lower()

        tag_m = re.search(r"[?&]tag=([^&]+)", dest)
        tag = tag_m.group(1) if tag_m else ""
        if not tag:
            print(f"OVERGESLAGEN, geen tag in {rule.get('source')}")
            continue

        asin = approved.get(name)
        if not asin:
            left[skipped.get(name, "ONBEKEND")] = left.get(skipped.get(name, "ONBEKEND"), 0) + 1
            continue

        rule["destination"] = TEMPLATE.format(asin=asin, tag=tag)
        converted += 1
        per_tag[tag] = per_tag.get(tag, 0) + 1

    print(f"om te zetten : {converted} redirects")
    for tag, n in sorted(per_tag.items()):
        print(f"    {tag:<24} {n}")
    print(f"blijft staan : REVIEW {left.get('REVIEW', 0)} · "
          f"NOT_FOUND {left.get('NOT_FOUND', 0)} · onbekend {left.get('ONBEKEND', 0)}")

    if args.dry_run:
        print("\n--dry-run: niets weggeschreven")
        return 0

    with open(args.vercel_json, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(f"\ngeschreven: {args.vercel_json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
