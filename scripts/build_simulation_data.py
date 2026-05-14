#!/usr/bin/env python3
"""Prepare compact data for the World Cup 2026 group-stage simulator."""

from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from datetime import date
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
MATCHES_PATH = PROJECT_DIR / "wm_2026_matches_fifa.json"
RANKING_PATH = PROJECT_DIR / "fifa_mens_ranking_latest.json"
RESULTS_PATH = PROJECT_DIR / "international_results.csv"
OUTPUT_PATH = PROJECT_DIR / "wm_2026_simulation_data.json"

NAME_ALIASES = {
    "USA": "United States",
    "Korea Republic": "South Korea",
    "IR Iran": "Iran",
    "Türkiye": "Turkey",
    "Czechia": "Czech Republic",
    "Côte d'Ivoire": "Ivory Coast",
    "Cabo Verde": "Cape Verde",
    "Congo DR": "DR Congo",
}

HOST_CODES = {"USA", "MEX", "CAN"}


def localized(items: list[dict] | None, default: str = "") -> str:
    for item in items or []:
        if str(item.get("Locale", "")).lower().startswith("en"):
            return item.get("Description", default)
    return items[0].get("Description", default) if items else default


def canonical_name(name: str) -> str:
    return NAME_ALIASES.get(name, name)


def tournament_k(tournament: str) -> int:
    name = tournament.lower()
    if "fifa world cup" == name:
        return 60
    if "qualification" in name:
        return 38
    if "friendly" in name:
        return 18
    if any(key in name for key in ["nations league", "copa américa", "african cup", "asian cup", "gold cup", "euro"]):
        return 45
    return 28


def compute_elo_and_calibration() -> tuple[dict[str, float], dict[str, float]]:
    ratings: defaultdict[str, float] = defaultdict(lambda: 1500.0)
    recent_games = 0
    recent_draws = 0
    recent_goals = 0
    recent_neutral_games = 0
    recent_host_wins = 0
    cutoff = date(2014, 1, 1)

    with RESULTS_PATH.open(newline="", encoding="utf-8") as handle:
        rows = sorted(csv.DictReader(handle), key=lambda row: row["date"])
        for row in rows:
            if row["home_score"] == "NA" or row["away_score"] == "NA":
                continue
            home = row["home_team"]
            away = row["away_team"]
            home_score = int(row["home_score"])
            away_score = int(row["away_score"])
            neutral = row["neutral"].upper() == "TRUE"
            played = date.fromisoformat(row["date"])

            home_advantage = 0 if neutral else 80
            expected_home = 1 / (1 + 10 ** ((ratings[away] - (ratings[home] + home_advantage)) / 400))
            actual_home = 1 if home_score > away_score else 0.5 if home_score == away_score else 0
            margin = abs(home_score - away_score)
            margin_multiplier = 1 if margin <= 1 else math.log(margin + 1) * 1.15
            change = tournament_k(row["tournament"]) * margin_multiplier * (actual_home - expected_home)
            ratings[home] += change
            ratings[away] -= change

            if played >= cutoff:
                recent_games += 1
                recent_goals += home_score + away_score
                recent_draws += int(home_score == away_score)
                if neutral:
                    recent_neutral_games += 1
                elif home_score > away_score:
                    recent_host_wins += 1

    calibration = {
        "recentGamesSince2014": recent_games,
        "drawRate": round(recent_draws / recent_games, 4),
        "avgGoals": round(recent_goals / recent_games, 4),
        "neutralShare": round(recent_neutral_games / recent_games, 4),
        "homeWinShareNonNeutral": round(recent_host_wins / max(recent_games - recent_neutral_games, 1), 4),
    }
    return dict(ratings), calibration


def main() -> None:
    matches_payload = json.loads(MATCHES_PATH.read_text(encoding="utf-8"))
    ranking_payload = json.loads(RANKING_PATH.read_text(encoding="utf-8"))
    elo, calibration = compute_elo_and_calibration()

    rankings = {}
    for row in ranking_payload["Results"]:
        name = localized(row.get("TeamName"), row["IdCountry"])
        rankings[row["IdCountry"]] = {
            "name": name,
            "rank": row["Rank"],
            "fifaPoints": row["DecimalTotalPoints"],
            "elo": round(elo.get(canonical_name(name), 1500.0), 1),
        }

    groups: dict[str, dict[str, dict]] = defaultdict(dict)
    matches = []
    for raw in sorted(matches_payload["Results"], key=lambda item: int(item["MatchNumber"])):
        if localized(raw.get("StageName")) != "First Stage":
            continue
        home = raw["Home"]
        away = raw["Away"]
        group = localized(raw.get("GroupName"))
        stadium = raw.get("Stadium") or {}
        home_name = localized(home.get("TeamName"), home["IdCountry"])
        away_name = localized(away.get("TeamName"), away["IdCountry"])
        for team in (home, away):
            code = team["IdCountry"]
            groups[group][code] = rankings[code]
        matches.append(
            {
                "number": int(raw["MatchNumber"]),
                "group": group,
                "date": raw["Date"],
                "city": localized(stadium.get("CityName")),
                "country": stadium.get("IdCountry"),
                "home": {"code": home["IdCountry"], "name": home_name},
                "away": {"code": away["IdCountry"], "name": away_name},
            }
        )

    payload = {
        "source": {
            "matches": "FIFA calendar API cache wm_2026_matches_fifa.json",
            "fifaRanking": "FIFA/Coca-Cola Men's World Ranking API cache fifa_mens_ranking_latest.json",
            "historicResults": "https://github.com/martj42/international_results/raw/master/results.csv",
            "elo": "Elo-style ratings computed locally from historic international results.",
        },
        "settings": {
            "runs": 5000,
            "hostBonusRatingPoints": 55,
            "hosts": sorted(HOST_CODES),
        },
        "calibration": calibration,
        "teams": rankings,
        "groups": groups,
        "matches": matches,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH} with {len(matches)} matches and {sum(len(v) for v in groups.values())} teams.")


if __name__ == "__main__":
    main()
