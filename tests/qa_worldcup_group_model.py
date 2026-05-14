#!/usr/bin/env python3
"""QA the simulator against historic World Cup group-stage outcomes."""

from __future__ import annotations

import csv
import json
import math
import random
from collections import defaultdict, deque
from datetime import date
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
RESULTS_PATH = PROJECT_DIR / "international_results.csv"
HISTORIC_RANKING_PATH = PROJECT_DIR / "ranking_fifa_historical.csv"
SIM_DATA_PATH = PROJECT_DIR / "wm_2026_simulation_data.json"
OUTPUT_PATH = PROJECT_DIR / "wm_2026_model_qa.json"

WORLD_CUP_YEARS = [1998, 2002, 2006, 2010, 2014, 2018, 2022]

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

RUNS = 5000
HOSTS = {"USA", "MEX", "CAN"}
HOST_BONUS = 55
RANDOMNESS_DIVISOR = 650
RANK_BUCKETS = [3, 7, 12, 20]


def canon(name: str) -> str:
    return NAME_ALIASES.get(name, name)


def load_world_cup_matches() -> dict[int, list[dict]]:
    by_year: dict[int, list[dict]] = defaultdict(list)
    with RESULTS_PATH.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row["tournament"] != "FIFA World Cup":
                continue
            if row["home_score"] == "NA" or row["away_score"] == "NA":
                continue
            year = int(row["date"][:4])
            if year in WORLD_CUP_YEARS:
                row["home_score"] = int(row["home_score"])
                row["away_score"] = int(row["away_score"])
                by_year[year].append(row)
    for rows in by_year.values():
        rows.sort(key=lambda row: row["date"])
    return by_year


def load_rankings() -> tuple[list[date], dict[date, dict[str, dict]]]:
    by_date: dict[date, dict[str, dict]] = defaultdict(dict)
    with HISTORIC_RANKING_PATH.open(newline="", encoding="utf-8") as handle:
        previous = None
        rank = 0
        for row in csv.DictReader(handle):
            ranking_date = date.fromisoformat(row["date"])
            if ranking_date != previous:
                rank = 0
                previous = ranking_date
            rank += 1
            if row["total_points"] == "NA":
                continue
            by_date[ranking_date][canon(row["team"])] = {
                "rank": rank,
                "points": float(row["total_points"]),
                "code": row["team_short"],
            }
    dates = sorted(by_date)
    return dates, by_date


def ranking_before(dates: list[date], rankings: dict[date, dict[str, dict]], tournament_start: str) -> tuple[date, dict[str, dict]]:
    start = date.fromisoformat(tournament_start)
    candidates = [item for item in dates if item <= start]
    selected = candidates[-1]
    return selected, rankings[selected]


def connected_groups(matches: list[dict]) -> list[set[str]]:
    graph: dict[str, set[str]] = defaultdict(set)
    for row in matches:
        home = canon(row["home_team"])
        away = canon(row["away_team"])
        graph[home].add(away)
        graph[away].add(home)
    seen = set()
    groups = []
    for team in graph:
        if team in seen:
            continue
        queue = deque([team])
        seen.add(team)
        comp = set()
        while queue:
            current = queue.popleft()
            comp.add(current)
            for nxt in graph[current]:
                if nxt not in seen:
                    seen.add(nxt)
                    queue.append(nxt)
        groups.append(comp)
    return sorted(groups, key=lambda group: sorted(group)[0])


def table_for_group(group: set[str], matches: list[dict]) -> list[dict]:
    table = {team: {"team": team, "pts": 0, "gf": 0, "ga": 0} for team in group}
    for row in matches:
        home = canon(row["home_team"])
        away = canon(row["away_team"])
        if home not in group or away not in group:
            continue
        table[home]["gf"] += row["home_score"]
        table[home]["ga"] += row["away_score"]
        table[away]["gf"] += row["away_score"]
        table[away]["ga"] += row["home_score"]
        if row["home_score"] > row["away_score"]:
            table[home]["pts"] += 3
        elif row["home_score"] < row["away_score"]:
            table[away]["pts"] += 3
        else:
            table[home]["pts"] += 1
            table[away]["pts"] += 1
    return sorted(
        ({**row, "gd": row["gf"] - row["ga"]} for row in table.values()),
        key=lambda row: (-row["pts"], -row["gd"], -row["gf"], row["team"]),
    )


def historic_top20_qa() -> dict:
    wc_matches = load_world_cup_matches()
    dates, rankings_by_date = load_rankings()
    rows = []
    year_summary = []
    for year in WORLD_CUP_YEARS:
        all_matches = wc_matches[year]
        group_matches = all_matches[:48]
        rank_date, ranking = ranking_before(dates, rankings_by_date, group_matches[0]["date"])
        groups = connected_groups(group_matches)
        if len(groups) != 8 or any(len(group) != 4 for group in groups):
            raise RuntimeError(f"Could not reconstruct eight 4-team groups for {year}: {[len(g) for g in groups]}")

        tournament_rows = []
        top20_total = 0
        top20_eliminated = 0
        for idx, group in enumerate(groups, 1):
            ranked_table = table_for_group(group, group_matches)
            qualified = {row["team"] for row in ranked_table[:2]}
            for row in ranked_table:
                rank = ranking.get(row["team"], {}).get("rank")
                is_top20 = isinstance(rank, int) and rank <= 20
                eliminated = row["team"] not in qualified
                if is_top20:
                    top20_total += 1
                    top20_eliminated += int(eliminated)
                rows.append({
                    "year": year,
                    "rankingDate": rank_date.isoformat(),
                    "group": idx,
                    "team": row["team"],
                    "fifaRank": rank,
                    "finish": ranked_table.index(row) + 1,
                    "qualifiedTop2": not eliminated,
                    "top20": is_top20,
                    "top20Eliminated": is_top20 and eliminated,
                })
                tournament_rows.append(rows[-1])
        ranked_tournament_rows = [row for row in tournament_rows if isinstance(row["fifaRank"], int)]
        ranked_tournament_rows.sort(key=lambda row: row["fifaRank"], reverse=True)
        for row in ranked_tournament_rows[:20]:
            row["flop20InTournament"] = True
        for row in ranked_tournament_rows[20:]:
            row["flop20InTournament"] = False
        year_summary.append({
            "year": year,
            "rankingDate": rank_date.isoformat(),
            "top20Teams": top20_total,
            "top20Eliminated": top20_eliminated,
            "top20EliminationRate": round(top20_eliminated / top20_total, 4),
        })

    top20 = [row for row in rows if row["top20"]]
    eliminated = [row for row in top20 if row["top20Eliminated"]]
    flop20 = [row for row in rows if row.get("flop20InTournament")]
    flop20_qualified = [row for row in flop20 if row["qualifiedTop2"]]
    buckets = {}
    for cutoff in RANK_BUCKETS:
        bucket_rows = [row for row in rows if isinstance(row["fifaRank"], int) and row["fifaRank"] <= cutoff]
        qualified = [row for row in bucket_rows if row["qualifiedTop2"]]
        buckets[f"top{cutoff}"] = {
            "teams": len(bucket_rows),
            "qualified": len(qualified),
            "eliminated": len(bucket_rows) - len(qualified),
            "qualificationRate": round(len(qualified) / len(bucket_rows), 4),
            "eliminationRate": round((len(bucket_rows) - len(qualified)) / len(bucket_rows), 4),
        }
    return {
        "years": WORLD_CUP_YEARS,
        "summary": {
            "top20Teams": len(top20),
            "top20Eliminated": len(eliminated),
            "top20EliminationRate": round(len(eliminated) / len(top20), 4),
            "flop20Teams": len(flop20),
            "flop20Qualified": len(flop20_qualified),
            "flop20QualificationRate": round(len(flop20_qualified) / len(flop20), 4),
        },
        "rankBuckets": buckets,
        "byYear": year_summary,
        "top20EliminatedTeams": eliminated,
        "flop20QualifiedTeams": flop20_qualified,
        "rows": rows,
    }


def current_top20_model_snapshot() -> dict:
    sim = json.loads(SIM_DATA_PATH.read_text(encoding="utf-8"))
    teams = sim["teams"]
    groups = sim["groups"]
    strengths = normalized_strengths(teams)
    aggregate = {group: {code: {"top2": 0, "first": 0} for code in members} for group, members in groups.items()}
    rng = random.Random(20260511)

    for _ in range(RUNS):
        tables = {group: {code: {"pts": 0, "gf": 0, "ga": 0} for code in members} for group, members in groups.items()}
        for match in sim["matches"]:
            home = match["home"]["code"]
            away = match["away"]["code"]
            home_rating = strengths[home] + (HOST_BONUS if home in HOSTS else 0)
            away_rating = strengths[away] + (HOST_BONUS if away in HOSTS else 0)
            diff = (home_rating - away_rating) / RANDOMNESS_DIVISOR
            base = sim["calibration"]["avgGoals"] / 2
            home_goals = poisson(max(0.25, min(4.2, base * math.exp(diff))), rng)
            away_goals = poisson(max(0.25, min(4.2, base * math.exp(-diff))), rng)
            home_row = tables[match["group"]][home]
            away_row = tables[match["group"]][away]
            home_row["gf"] += home_goals
            home_row["ga"] += away_goals
            away_row["gf"] += away_goals
            away_row["ga"] += home_goals
            if home_goals > away_goals:
                home_row["pts"] += 3
            elif home_goals < away_goals:
                away_row["pts"] += 3
            else:
                home_row["pts"] += 1
                away_row["pts"] += 1

        for group, table in tables.items():
            ranked = sorted(
                (
                    {
                        "code": code,
                        "pts": row["pts"],
                        "gf": row["gf"],
                        "gd": row["gf"] - row["ga"],
                        "tie": rng.random(),
                    }
                    for code, row in table.items()
                ),
                key=lambda row: (-row["pts"], -row["gd"], -row["gf"], row["tie"]),
            )
            for idx, row in enumerate(ranked):
                if idx == 0:
                    aggregate[group][row["code"]]["first"] += 1
                if idx <= 1:
                    aggregate[group][row["code"]]["top2"] += 1

    all_ranked = []
    for group, members in groups.items():
        for code in members:
            rank = teams[code]["rank"]
            top2 = aggregate[group][code]["top2"] / RUNS
            all_ranked.append({
                "code": code,
                "team": teams[code]["name"],
                "group": group,
                "rank": rank,
                "top2Probability": round(top2, 4),
                "eliminationProbability": round(1 - top2, 4),
                "groupWinnerProbability": round(aggregate[group][code]["first"] / RUNS, 4),
            })
    top20 = [row for row in all_ranked if row["rank"] <= 20]
    flop20 = sorted(all_ranked, key=lambda row: row["rank"], reverse=True)[:20]
    predicted_eliminations = sum(row["eliminationProbability"] for row in top20)
    predicted_flop20_qualifiers = sum(row["top2Probability"] for row in flop20)
    buckets = {}
    for cutoff in RANK_BUCKETS:
        bucket_rows = [row for row in all_ranked if row["rank"] <= cutoff]
        expected_eliminations = sum(row["eliminationProbability"] for row in bucket_rows)
        expected_qualifiers = sum(row["top2Probability"] for row in bucket_rows)
        buckets[f"top{cutoff}"] = {
            "teams": len(bucket_rows),
            "expectedQualified": round(expected_qualifiers, 2),
            "expectedEliminated": round(expected_eliminations, 2),
            "expectedQualificationRate": round(expected_qualifiers / len(bucket_rows), 4),
            "expectedEliminationRate": round(expected_eliminations / len(bucket_rows), 4),
        }
    return {
        "model": "current default: Blend / Normal / 5,000 runs",
        "top20TeamsIn2026Groups": sorted(top20, key=lambda row: row["rank"]),
        "flop20TeamsIn2026Groups": sorted(flop20, key=lambda row: row["rank"], reverse=True),
        "allTeamsIn2026Groups": sorted(all_ranked, key=lambda row: row["rank"]),
        "rankBuckets": buckets,
        "summary": {
            "top20Teams": len(top20),
            "expectedTop20Eliminations": round(predicted_eliminations, 2),
            "expectedTop20EliminationRate": round(predicted_eliminations / len(top20), 4),
            "flop20Teams": len(flop20),
            "expectedFlop20Qualifiers": round(predicted_flop20_qualifiers, 2),
            "expectedFlop20QualificationRate": round(predicted_flop20_qualifiers / len(flop20), 4),
        },
    }


def normalized_strengths(teams: dict) -> dict[str, float]:
    codes = list(teams)
    fifa_values = [teams[code]["fifaPoints"] for code in codes]
    elo_values = [teams[code]["elo"] for code in codes]
    fifa_mean = sum(fifa_values) / len(fifa_values)
    elo_mean = sum(elo_values) / len(elo_values)
    fifa_sd = math.sqrt(sum((value - fifa_mean) ** 2 for value in fifa_values) / len(fifa_values))
    elo_sd = math.sqrt(sum((value - elo_mean) ** 2 for value in elo_values) / len(elo_values))
    return {
        code: 1700 + (((teams[code]["fifaPoints"] - fifa_mean) / fifa_sd + (teams[code]["elo"] - elo_mean) / elo_sd) / 2) * 155
        for code in codes
    }


def poisson(lam: float, rng: random.Random) -> int:
    limit = math.exp(-lam)
    k = 0
    p = 1.0
    while p > limit:
        k += 1
        p *= rng.random()
    return k - 1


def main() -> None:
    payload = {
        "historic": historic_top20_qa(),
        "current": current_top20_model_snapshot(),
        "method": {
            "rankingSource": "Dato-Futbol/fifa-ranking ranking_fifa_historical.csv, scraped from official FIFA website according to repo README.",
            "resultSource": "martj42/international_results results.csv.",
            "scope": "FIFA World Cup 1998-2022 group stages, first 48 matches per tournament, top 2 qualify.",
            "groupReconstruction": "Connected components from the first 48 tournament matches; each component must have four teams.",
        }
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    summary = payload["historic"]["summary"]
    current = payload["current"]["summary"]
    print(f"Wrote {OUTPUT_PATH}")
    print(f"Historic top-20 eliminated: {summary['top20Eliminated']} / {summary['top20Teams']} = {summary['top20EliminationRate']:.1%}")
    print(f"Historic tournament-flop-20 qualified: {summary['flop20Qualified']} / {summary['flop20Teams']} = {summary['flop20QualificationRate']:.1%}")
    print(f"Current model expected top-20 eliminated: {current['expectedTop20Eliminations']} / {current['top20Teams']} = {current['expectedTop20EliminationRate']:.1%}")
    print(f"Current model expected tournament-flop-20 qualified: {current['expectedFlop20Qualifiers']} / {current['flop20Teams']} = {current['expectedFlop20QualificationRate']:.1%}")
    print("Buckets historic vs current:")
    for key in [f"top{cutoff}" for cutoff in RANK_BUCKETS]:
        h = payload["historic"]["rankBuckets"][key]
        c = payload["current"]["rankBuckets"][key]
        print(key, f"historic qual {h['qualificationRate']:.1%}", f"current qual {c['expectedQualificationRate']:.1%}")
    for row in payload["historic"]["byYear"]:
        print(row)


if __name__ == "__main__":
    main()
