#!/usr/bin/env python3
"""Create deterministic mock odds for local simulator development.

These are not real betting odds. They approximate 1X2 probabilities from the
local FIFA/Elo team strengths and add small deterministic noise so the Market
integration can be developed before live odds are available.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
SIM_PATH = PROJECT_DIR / "wm_2026_simulation_data.json"
OUTPUT_PATH = PROJECT_DIR / "wm_2026_odds_snapshot.json"
HOSTS = {"USA", "MEX", "CAN"}
HOST_BONUS = 55


def normalize(values: dict[str, float]) -> dict[str, float]:
    total = sum(values.values())
    return {key: round(value / total, 4) for key, value in values.items()}


def decimal_from_prob(probability: float) -> float:
    return round(1 / max(probability, 0.01), 3)


def main() -> None:
    data = json.loads(SIM_PATH.read_text(encoding="utf-8"))
    teams = data["teams"]
    fifa_values = [team["fifaPoints"] for team in teams.values()]
    elo_values = [team["elo"] for team in teams.values()]
    fifa_mean = sum(fifa_values) / len(fifa_values)
    elo_mean = sum(elo_values) / len(elo_values)
    fifa_sd = math.sqrt(sum((value - fifa_mean) ** 2 for value in fifa_values) / len(fifa_values))
    elo_sd = math.sqrt(sum((value - elo_mean) ** 2 for value in elo_values) / len(elo_values))
    strengths = {}
    for code, team in teams.items():
        fifa_z = (team["fifaPoints"] - fifa_mean) / fifa_sd
        elo_z = (team["elo"] - elo_mean) / elo_sd
        strengths[code] = 1700 + (fifa_z * 0.6 + elo_z * 0.4) * 155

    rng = random.Random(20260511)
    matches = []
    for match in data["matches"]:
        home = match["home"]["code"]
        away = match["away"]["code"]
        home_rating = strengths[home] + (HOST_BONUS if home in HOSTS else 0)
        away_rating = strengths[away] + (HOST_BONUS if away in HOSTS else 0)
        rating_gap = home_rating - away_rating
        diff = rating_gap / 230
        home_win = 1 / (1 + math.exp(-diff))
        mismatch = min(abs(rating_gap) / 360, 1)
        draw = data["calibration"]["drawRate"] * (1 - mismatch * 0.48)
        non_draw = 1 - draw
        base = normalize({
            "home": home_win * non_draw,
            "draw": draw,
            "away": (1 - home_win) * non_draw,
        })

        noisy = {}
        for key, value in base.items():
            noisy[key] = max(0.03, value * (1 + rng.uniform(-0.1, 0.1)))
        probability = normalize(noisy)
        average_odds = {key: decimal_from_prob(value) for key, value in probability.items()}
        matches.append({
            "matchNumber": match["number"],
            "eventId": f"mock-{match['number']}",
            "home": match["home"]["name"],
            "away": match["away"]["name"],
            "date": match["date"],
            "league": {"name": "FIFA World Cup 2026", "slug": "mock-fifa-world-cup-2026"},
            "market1x2": {
                "bookmakerCountUsed": 1,
                "averageDecimalOdds": average_odds,
                "noVigProbability": probability,
                "rawBookmakers": [
                    {
                        "bookmaker": "MockMarket",
                        "home": average_odds["home"],
                        "draw": average_odds["draw"],
                        "away": average_odds["away"],
                    }
                ],
            },
            "mock": True,
        })

    snapshot = {
        "provider": "Mock odds for local development",
        "createdAt": "mock",
        "bookmakers": ["MockMarket"],
        "requestStrategy": "Generated locally from FIFA/Elo strengths with deterministic +/-10% noise. Not real odds.",
        "eventPoolSize": len(matches),
        "coverage": {
            "matchesTotal": len(data["matches"]),
            "eventsLinked": len(matches),
            "oddsAvailable": len(matches),
            "missingMatchNumbers": [],
        },
        "matches": matches,
    }
    OUTPUT_PATH.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH} with {len(matches)} mock odds.")


if __name__ == "__main__":
    main()
