#!/usr/bin/env python3
"""Fetch current KO-round odds for WM 2026 from Odds-API.io.

Saves data/ko_odds.json keyed by "HOME|AWAY" (normalized uppercase FIFA codes)
so kicktipp_http.js can blend them with ELO for KO round tips.
"""
from __future__ import annotations
import json, os, sys, time, urllib.request, urllib.parse
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH    = PROJECT_DIR / ".env"
OUTPUT_PATH = PROJECT_DIR / "data" / "ko_odds.json"
BASE_URL    = "https://api.odds-api.io/v3"
BOOKMAKERS  = "Bet365,Unibet"

# FIFA code lookup by team name (as returned by the API)
NAME_TO_CODE = {
    "brazil":"BRA","japan":"JPN","germany":"GER","paraguay":"PAR",
    "netherlands":"NED","morocco":"MAR","ivory coast":"CIV","norway":"NOR",
    "france":"FRA","sweden":"SWE","mexico":"MEX","ecuador":"ECU",
    "england":"ENG","congo dr":"COD","dr congo":"COD","belgium":"BEL",
    "senegal":"SEN","usa":"USA","united states":"USA",
    "bosnia and herzegovina":"BIH","spain":"ESP","austria":"AUT",
    "portugal":"POR","croatia":"CRO","switzerland":"SUI","algeria":"ALG",
    "australia":"AUS","egypt":"EGY","argentina":"ARG","cape verde":"CPV",
    "colombia":"COL","ghana":"GHA","canada":"CAN","south africa":"RSA",
    "south korea":"KOR","korea republic":"KOR","uruguay":"URU",
    "uzbekistan":"UZB","saudi arabia":"KSA","jordan":"JOR","iran":"IRN",
    "qatar":"QAT","new zealand":"NZL","haiti":"HAI","panama":"PAN",
    "curacao":"CUW","iraq":"IRQ",
}

def load_env():
    if not ENV_PATH.exists(): return
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

def api_get(path, params):
    url = f"{BASE_URL}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "wm2026-ko-odds/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

def normalize(name: str) -> str:
    return name.lower().strip()

def to_code(name: str) -> str | None:
    return NAME_TO_CODE.get(normalize(name))

def no_vig(home_dec, draw_dec, away_dec):
    ih, id_, ia = 1/home_dec, 1/draw_dec, 1/away_dec
    margin = ih + id_ + ia
    return {"home": round(ih/margin, 4), "draw": round(id_/margin, 4), "away": round(ia/margin, 4)}

def main():
    load_env()
    api_key = os.environ.get("ODDS_API_KEY")
    if not api_key:
        print("Missing ODDS_API_KEY", file=sys.stderr); sys.exit(2)

    # 1. Fetch all current football events
    events = api_get("/events", {"apiKey": api_key, "sport": "football"})

    # 2. Filter: FIFA World Cup + pending (upcoming/live)
    wc_pending = [
        e for e in events
        if "world cup" in str(e.get("league", "")).lower()
        and e.get("status") in ("pending", "live", "inplay")
        and not str(e.get("home","")).startswith("W")  # skip "W77", "W78" placeholders
        and not str(e.get("away","")).startswith("W")
    ]
    print(f"WC pending events with known teams: {len(wc_pending)}")

    if not wc_pending:
        print("No pending WC events with known teams — keeping existing ko_odds.json")
        return

    # 3. Fetch odds for each event
    event_ids = [str(e["id"]) for e in wc_pending]
    all_odds = []
    for i in range(0, len(event_ids), 10):
        chunk = event_ids[i:i+10]
        payload = api_get("/odds/multi", {
            "apiKey": api_key,
            "eventIds": ",".join(chunk),
            "bookmakers": BOOKMAKERS,
        })
        if isinstance(payload, list):
            all_odds.extend(payload)
        time.sleep(0.2)

    odds_by_id = {str(o.get("id")): o for o in all_odds}

    # 4. Build output keyed by "HOMECODE|AWAYCODE"
    result = {}
    for ev in wc_pending:
        hcode = to_code(ev.get("home", ""))
        acode = to_code(ev.get("away", ""))
        if not hcode or not acode:
            print(f"  ⚠ Could not resolve: {ev.get('home')} vs {ev.get('away')}")
            continue

        key = f"{hcode}|{acode}"
        odds_data = odds_by_id.get(str(ev["id"]))
        if not odds_data:
            print(f"  — No odds: {hcode} vs {acode}")
            continue

        # Extract 1x2 prices
        prices = []
        for bm, markets in (odds_data.get("bookmakers") or {}).items():
            for mkt in (markets or []):
                if str(mkt.get("name","")).lower() in {"ml","moneyline","match winner","1x2","h2h"}:
                    for item in (mkt.get("odds") or []):
                        try:
                            h, d, a = float(item["home"]), float(item["draw"]), float(item["away"])
                            if h > 1 and d > 1 and a > 1:
                                prices.append((h, d, a))
                        except (KeyError, TypeError, ValueError):
                            pass

        if not prices:
            print(f"  — No 1x2 prices: {hcode} vs {acode}")
            continue

        avg_h = sum(p[0] for p in prices) / len(prices)
        avg_d = sum(p[1] for p in prices) / len(prices)
        avg_a = sum(p[2] for p in prices) / len(prices)
        probs = no_vig(avg_h, avg_d, avg_a)

        result[key] = {
            "home": hcode, "away": acode,
            "date": ev.get("date","")[:10],
            "noVigProbability": probs,
            "bookmakerCount": len(prices),
        }
        print(f"  ✅ {hcode} vs {acode}: {probs['home']:.0%} / {probs['draw']:.0%} / {probs['away']:.0%}  ({len(prices)} BMs)")

    OUTPUT_PATH.write_text(json.dumps({"fetchedAt": __import__('datetime').datetime.utcnow().isoformat()+"Z", "matches": result}, indent=2))
    print(f"\n→ Saved {len(result)} KO odds to {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
