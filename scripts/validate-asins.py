#!/usr/bin/env python3
"""Controleert of elke ASIN in een vercel.json daadwerkelijk een levend product is.

Een ASIN uit een Amazon-zoekresultaat is niet vanzelf een geldige productpagina:
varianten en verwijderde items komen wel in de SERP voor maar geven op /dp/<ASIN>
een 400. In een steekproef van 21 was er één zo'n dode ASIN — over vierhonderd
omzettingen zijn dat er tientallen.

Waarom niet gewoon curl'en: Amazon throttelt na een handvol snelle verzoeken en
geeft dan verbindingsfouten die niet van een dode ASIN te onderscheiden zijn.
De DataForSEO-endpoint geeft een eenduidig antwoord.

Gebruik:
    python scripts/validate-asins.py ../theduvetadvisor/vercel.json --out out/duvet
"""

from __future__ import annotations

import argparse
import json
import os
import re
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


def check(asin: str, auth: str) -> dict:
    body = json.dumps([{
        "asin": asin,
        "language_code": "en_US",
        "location_name": "United States",
    }]).encode()
    req = urllib.request.Request(
        API, data=body,
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.load(resp)
    task = data["tasks"][0]
    if task.get("status_code") != 20000:
        return {"alive": False, "why": f"task {task.get('status_code')}: {task.get('status_message', '')[:70]}"}
    result = (task.get("result") or [{}])[0]
    items = result.get("items") or []
    if not items:
        return {"alive": False, "why": "geen productgegevens"}
    item = items[0]
    return {"alive": True, "title": (item.get("title") or "")[:110]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("vercel_json")
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=5)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    cache_path = os.path.join(args.out, "asin-validity.json")
    cache = {}
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as fh:
            cache = json.load(fh)

    with open(args.vercel_json, encoding="utf-8") as fh:
        cfg = json.load(fh)

    asins: dict[str, list[str]] = {}
    for rule in cfg.get("redirects", []):
        m = re.search(r"/dp/([A-Z0-9]{10})", rule.get("destination", ""))
        if m:
            asins.setdefault(m.group(1), []).append(rule.get("source", ""))

    todo = [a for a in asins if a not in cache]
    print(f"{len(asins)} unieke ASIN's, {len(todo)} te controleren  (${len(todo) * COST_PER_CALL:.2f})")

    auth = auth_header()
    lock = Lock()
    done = [0]

    def work(asin: str) -> None:
        try:
            res = check(asin, auth)
        except Exception as exc:
            res = {"alive": None, "why": f"{type(exc).__name__}: {exc}"}
        with lock:
            cache[asin] = res
            done[0] += 1
            if done[0] % 20 == 0 or done[0] == len(todo):
                print(f"  {done[0]}/{len(todo)}")
                with open(cache_path, "w", encoding="utf-8") as fh:
                    json.dump(cache, fh, ensure_ascii=False, indent=1)

    if todo:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            list(pool.map(work, todo))
    with open(cache_path, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, ensure_ascii=False, indent=1)

    dead = {a: cache[a] for a in asins if cache.get(a, {}).get("alive") is False}
    unknown = {a: cache[a] for a in asins if cache.get(a, {}).get("alive") is None}

    print(f"\nlevend  : {len(asins) - len(dead) - len(unknown)}")
    print(f"DOOD    : {len(dead)}")
    print(f"onbekend: {len(unknown)}")
    for a, info in dead.items():
        print(f"  DOOD {a}  {info.get('why', '')}  ({len(asins[a])} redirects)")
        for s in asins[a][:2]:
            print(f"       {s}")
    for a, info in unknown.items():
        print(f"  ?    {a}  {info.get('why', '')}")

    return 1 if dead or unknown else 0


if __name__ == "__main__":
    sys.exit(main())
