#!/usr/bin/env python3
"""Fetch a local Odds-API.io snapshot for the World Cup simulator.

Requires:
    export ODDS_API_KEY="..."

The script never writes the API key to disk and produces a local JSON file that
the browser can read without calling the odds provider directly.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
MATCHES_PATH = PROJECT_DIR.parent / "data" / "wm_2026_simulation_data.json"
OUTPUT_PATH = PROJECT_DIR.parent / "data" / "wm_2026_odds_snapshot.json"
ENV_PATH = PROJECT_DIR.parent / ".env"
BASE_URL = "https://api.odds-api.io/v3"
DEFAULT_BOOKMAKERS = "Bet365,Unibet"

TEAM_ALIASES = {
    "usa": "united states",
    "korea republic": "south korea",
    "ir iran": "iran",
    "türkiye": "turkey",
    "czechia": "czech republic",
    "côte d'ivoire": "ivory coast",
    "cabo verde": "cape verde",
    "congo dr": "dr congo",
}


def normalize_team(name: str) -> str:
    cleaned = (
        name.lower()
        .replace(" fc", "")
        .replace(" national team", "")
        .replace(".", "")
        .strip()
    )
    return TEAM_ALIASES.get(cleaned, cleaned)


def load_env_file() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def request_json(path: str, params: dict[str, str]) -> object:
    url = f"{BASE_URL}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "wm-2026-local-simulator/1.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        if response.status >= 400:
            raise RuntimeError(f"Odds-API.io returned HTTP {response.status}: {url}")
        return json.loads(response.read().decode("utf-8"))


def extract_1x2(event_odds: dict) -> dict | None:
    prices = []
    for bookmaker, markets in (event_odds.get("bookmakers") or {}).items():
        for market in markets or []:
            name = str(market.get("name", "")).lower()
            if name not in {"ml", "moneyline", "match winner", "1x2", "h2h"}:
                continue
            for item in market.get("odds") or []:
                home = parse_float(item.get("home"))
                draw = parse_float(item.get("draw"))
                away = parse_float(item.get("away"))
                if home and draw and away:
                    prices.append({"bookmaker": bookmaker, "home": home, "draw": draw, "away": away})

    if not prices:
        return None

    avg = {
        "home": sum(row["home"] for row in prices) / len(prices),
        "draw": sum(row["draw"] for row in prices) / len(prices),
        "away": sum(row["away"] for row in prices) / len(prices),
    }
    implied = {key: 1 / value for key, value in avg.items()}
    margin = sum(implied.values())
    no_vig = {key: round(value / margin, 4) for key, value in implied.items()}
    return {
        "bookmakerCountUsed": len(prices),
        "averageDecimalOdds": {key: round(value, 3) for key, value in avg.items()},
        "noVigProbability": no_vig,
        "rawBookmakers": prices,
    }


def parse_float(value: object) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 1 else None


def search_event(api_key: str, match: dict) -> dict | None:
    # Search uses up to 10 results; trying home-away first usually finds the
    # specific fixture if the provider has listed it.
    queries = [
        f"{match['home']['name']} {match['away']['name']}",
        match["home"]["name"],
        match["away"]["name"],
    ]
    target_home = normalize_team(match["home"]["name"])
    target_away = normalize_team(match["away"]["name"])
    target_date = match["date"][:10]

    for query in queries:
        results = request_json("/events/search", {"apiKey": api_key, "query": query})
        if not isinstance(results, list):
            continue
        for event in results:
            event_home = normalize_team(str(event.get("home", "")))
            event_away = normalize_team(str(event.get("away", "")))
            event_date = str(event.get("date", ""))[:10]
            teams_match = {event_home, event_away} == {target_home, target_away}
            if teams_match and event_date == target_date:
                return event
    return None


def fetch_events(api_key: str, matches: list[dict], bookmaker: str | None = None) -> list[dict]:
    dates = sorted(match["date"] for match in matches)
    params = {
        "apiKey": api_key,
        "sport": "football",
        "from": dates[0],
        "to": dates[-1],
        "status": "pending",
    }
    if bookmaker:
        params["bookmaker"] = bookmaker
    payload = request_json("/events", params)
    return payload if isinstance(payload, list) else []


def match_event_from_pool(match: dict, events: list[dict]) -> dict | None:
    target_home = normalize_team(match["home"]["name"])
    target_away = normalize_team(match["away"]["name"])
    target_date = match["date"][:10]
    for event in events:
        event_home = normalize_team(str(event.get("home", "")))
        event_away = normalize_team(str(event.get("away", "")))
        event_date = str(event.get("date", ""))[:10]
        if {event_home, event_away} == {target_home, target_away} and event_date == target_date:
            return event
    return None


def fetch_multi_odds(api_key: str, event_ids: list[str], bookmakers: str) -> list[dict]:
    all_odds = []
    for index in range(0, len(event_ids), 10):
        chunk = event_ids[index:index + 10]
        payload = request_json(
            "/odds/multi",
            {
                "apiKey": api_key,
                "eventIds": ",".join(chunk),
                "bookmakers": bookmakers,
            },
        )
        if isinstance(payload, list):
            all_odds.extend(payload)
        time.sleep(0.2)
    return all_odds


def main() -> None:
    load_env_file()
    api_key = os.environ.get("ODDS_API_KEY")
    if not api_key:
        print("Missing ODDS_API_KEY. Export your Odds-API.io key first.", file=sys.stderr)
        sys.exit(2)

    bookmakers = os.environ.get("ODDS_API_BOOKMAKERS", DEFAULT_BOOKMAKERS)
    bookmaker_filter = os.environ.get("ODDS_API_EVENT_BOOKMAKER")
    sim_data = json.loads(MATCHES_PATH.read_text(encoding="utf-8"))
    matches = sim_data["matches"]

    events = fetch_events(api_key, matches, bookmaker_filter)
    linked = []
    missing = []
    for match in matches:
        event = match_event_from_pool(match, events)
        if event:
            linked.append({"matchNumber": match["number"], "eventId": str(event["id"]), "event": event})
        else:
            missing.append(match["number"])

    event_ids = [row["eventId"] for row in linked]
    odds_payload = fetch_multi_odds(api_key, event_ids, bookmakers) if event_ids else []
    odds_by_id = {str(item.get("id")): item for item in odds_payload}

    matches_out = []
    for row in linked:
        event_odds = odds_by_id.get(row["eventId"])
        market = extract_1x2(event_odds or {}) if event_odds else None
        matches_out.append(
            {
                "matchNumber": row["matchNumber"],
                "eventId": row["eventId"],
                "home": row["event"].get("home"),
                "away": row["event"].get("away"),
                "date": row["event"].get("date"),
                "league": row["event"].get("league"),
                "market1x2": market,
            }
        )

    snapshot = {
        "provider": "Odds-API.io",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "bookmakers": bookmakers.split(","),
        "blendWeight": 0.65,
        "requestStrategy": "one /events request for the tournament date range, then /odds/multi in chunks of 10 event IDs",
        "eventPoolSize": len(events),
        "coverage": {
            "matchesTotal": len(matches),
            "eventsLinked": len(linked),
            "oddsAvailable": sum(1 for row in matches_out if row["market1x2"]),
            "missingMatchNumbers": missing,
        },
        "matches": matches_out,
    }
    OUTPUT_PATH.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH}")
    print(snapshot["coverage"])


if __name__ == "__main__":
    main()
