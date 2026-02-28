from __future__ import annotations

import argparse
import csv
import json
import random
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any


SEED = 20260228
DEFAULT_ROWS = 5000
DATE_START = date(2025, 4, 1)
DATE_END = date(2025, 4, 30)
COLUMNS = [
    "id",
    "enumerator_id",
    "survey_date",
    "duration_minutes",
    "respondent_age",
    "household_size",
    "monthly_income",
    "monthly_expenditure",
    "asset_count",
]
ENUMERATOR_ROW_COUNTS = {
    "E01": 255,
    "E02": 250,
    "E03": 315,
    "E04": 245,
    "E05": 240,
    "E06": 235,
    "E07": 405,
    "E08": 230,
    "E09": 225,
    "E10": 220,
    "E11": 215,
    "E12": 210,
    "E13": 200,
    "E14": 365,
    "E15": 195,
    "E16": 185,
    "E17": 175,
    "E18": 160,
    "E19": 495,
    "E20": 180,
}
HIGH_ERROR_ENUMERATORS = ("E19", "E14", "E07", "E03")
HIGH_PRODUCTIVITY_ENUMERATORS = ("E19", "E07")
LOW_PRODUCTIVITY_ENUMERATORS = ("E18", "E17", "E20", "E16")
MISSINGNESS_RATES = {
    "id": {"E19": 0.04, "E14": 0.02, "E07": 0.02, "E03": 0.01, "__default__": 0.005},
    "survey_date": {"E19": 0.06, "E14": 0.04, "E07": 0.03, "E03": 0.02, "__default__": 0.01},
    "duration_minutes": {"E19": 0.20, "E14": 0.12, "E07": 0.10, "E03": 0.08, "__default__": 0.03},
    "respondent_age": {"E19": 0.12, "E14": 0.08, "E07": 0.06, "E03": 0.05, "__default__": 0.02},
    "monthly_income": {"E19": 0.85, "E14": 0.75, "E07": 0.70, "E03": 0.60, "__default__": 0.10},
    "monthly_expenditure": {"E19": 0.80, "E14": 0.75, "E07": 0.70, "E03": 0.65, "__default__": 0.08},
    "asset_count": {"E19": 0.45, "E14": 0.35, "E07": 0.30, "E03": 0.25, "__default__": 0.05},
}
NUMERIC_OUTLIER_COUNTS = {
    "respondent_age": 12,
    "household_size": 15,
    "monthly_income": 25,
    "monthly_expenditure": 25,
    "asset_count": 15,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate deterministic sample survey data for HFC testing.")
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--out", type=Path, default=Path("samples/sample_survey.csv"))
    parser.add_argument("--manifest", type=Path, default=Path("samples/sample_survey_manifest.json"))
    return parser.parse_args()


def all_dates() -> list[date]:
    days = (DATE_END - DATE_START).days + 1
    return [DATE_START + timedelta(days=offset) for offset in range(days)]


def weighted_days(enum_id: str, row_count: int, rng: random.Random) -> list[date]:
    dates = all_dates()
    if enum_id == "E19":
        heavy_days = dates[:5]
        weights = [8 if d in heavy_days else 1 for d in dates]
    elif enum_id == "E07":
        heavy_days = dates[5:9]
        weights = [6 if d in heavy_days else 1 for d in dates]
    elif enum_id in LOW_PRODUCTIVITY_ENUMERATORS:
        active_days = 12 if enum_id in {"E17", "E18"} else 14
        keep = set(rng.sample(dates, active_days))
        weights = [2 if d in keep else 0 for d in dates]
    else:
        weights = [1 for _ in dates]

    assigned: list[date] = []
    population = list(range(len(dates)))
    for _ in range(row_count):
        idx = rng.choices(population=population, weights=weights, k=1)[0]
        assigned.append(dates[idx])
    assigned.sort()
    return assigned


def baseline_row(row_number: int, enum_id: str, survey_day: date, rng: random.Random) -> dict[str, Any]:
    age = max(18, min(85, int(round(rng.gauss(39, 13)))))
    household_size = max(1, min(12, int(round(rng.triangular(1, 12, 4)))))
    income = max(90, int(round(rng.lognormvariate(7.1, 0.45))))
    spend_ratio = min(1.18, max(0.45, rng.normalvariate(0.78, 0.16)))
    expenditure = max(60, int(round(income * spend_ratio + household_size * rng.uniform(8, 25))))
    assets = max(0, min(15, int(round((income / 900) + rng.gauss(2.5, 2.0)))))
    duration = max(8, min(75, int(round(rng.gauss(31, 9) + household_size * 0.8))))

    return {
        "id": f"R{row_number:05d}",
        "enumerator_id": enum_id,
        "survey_date": survey_day.isoformat(),
        "duration_minutes": duration,
        "respondent_age": age,
        "household_size": household_size,
        "monthly_income": income,
        "monthly_expenditure": expenditure,
        "asset_count": assets,
    }


def choose_indices(indices: list[int], count: int, rng: random.Random) -> list[int]:
    if count <= 0:
        return []
    return rng.sample(indices, min(count, len(indices)))


def choose_indices_where(rows: list[dict[str, Any]], enum_id: str, predicate: Any) -> list[int]:
    return [idx for idx, row in enumerate(rows) if row["enumerator_id"] == enum_id and predicate(row)]


def pick_by_rates(rows: list[dict[str, Any]], rates: dict[str, float], rng: random.Random) -> dict[str, list[int]]:
    selected: dict[str, list[int]] = {}
    for enum_id, row_count in ENUMERATOR_ROW_COUNTS.items():
        indices = [idx for idx, row in enumerate(rows) if row["enumerator_id"] == enum_id]
        rate = rates.get(enum_id, rates["__default__"])
        target = round(row_count * rate)
        selected[enum_id] = choose_indices(indices, target, rng)
    return selected


def json_value(value: Any) -> Any:
    if value == "":
        return None
    return value


def register_issue(
    issues_by_row: dict[int, list[str]],
    issue_tally: dict[str, Counter[str]],
    row_idx: int,
    issue_name: str,
    enum_id: str,
) -> None:
    issues_by_row[row_idx].append(issue_name)
    issue_tally[issue_name][enum_id] += 1


def main() -> int:
    args = parse_args()
    if args.rows != DEFAULT_ROWS:
        raise ValueError(f"This generator currently supports exactly {DEFAULT_ROWS} rows.")

    rng = random.Random(args.seed)
    rows: list[dict[str, Any]] = []

    row_number = 1
    for enum_id, row_count in ENUMERATOR_ROW_COUNTS.items():
        for survey_day in weighted_days(enum_id, row_count, rng):
            rows.append(baseline_row(row_number, enum_id, survey_day, rng))
            row_number += 1

    if len(rows) != args.rows:
        raise ValueError(f"Generated {len(rows)} rows instead of {args.rows}.")

    issues_by_row: dict[int, list[str]] = defaultdict(list)
    issue_tally: dict[str, Counter[str]] = defaultdict(Counter)

    duplicate_pair_plan = {
        "E19": 25,
        "E07": 18,
        "E14": 14,
        "E03": 10,
        "E01": 3,
        "E05": 3,
        "E11": 3,
        "E16": 2,
        "E20": 2,
    }
    high_error_pool = [idx for idx, row in enumerate(rows) if row["enumerator_id"] in HIGH_ERROR_ENUMERATORS]
    clean_ids = [row["id"] for row in rows]
    used_targets: set[int] = set()
    for enum_id, pair_count in duplicate_pair_plan.items():
        source_indices = [idx for idx, row in enumerate(rows) if row["enumerator_id"] == enum_id]
        target_indices = [idx for idx in source_indices if idx not in used_targets][:pair_count]
        fallback_indices = [idx for idx in high_error_pool if idx not in used_targets]
        while len(target_indices) < pair_count and fallback_indices:
            target_indices.append(fallback_indices.pop(0))

        donor_pool = [idx for idx in range(len(rows)) if idx not in target_indices]
        for target_idx in target_indices[:pair_count]:
            donor_idx = rng.choice(donor_pool)
            rows[target_idx]["id"] = clean_ids[donor_idx]
            used_targets.add(target_idx)
            register_issue(issues_by_row, issue_tally, target_idx, "duplicate_id", rows[target_idx]["enumerator_id"])

    for column, rate_map in MISSINGNESS_RATES.items():
        selections = pick_by_rates(rows, rate_map, rng)
        for enum_id, selected_indices in selections.items():
            for idx in selected_indices:
                rows[idx][column] = ""
                register_issue(issues_by_row, issue_tally, idx, f"missing_{column}", enum_id)

    duration_short = {"E19": 15, "E07": 10, "E14": 8, "E03": 6, "E01": 2, "E10": 2, "E18": 2}
    duration_impossible = {"E19": 7, "E07": 5, "E14": 3, "E03": 2, "E12": 1, "E20": 2}
    duration_long = {"E19": 12, "E07": 8, "E14": 6, "E03": 4, "E02": 1, "E06": 1, "E11": 1, "E16": 1, "E18": 1}
    duration_heaped = {"E19": 16, "E07": 12, "E14": 8, "E03": 3, "E05": 1}

    for enum_id, count in duration_short.items():
        candidates = choose_indices_where(rows, enum_id, lambda row: row["duration_minutes"] != "")
        for idx in choose_indices(candidates, count, rng):
            rows[idx]["duration_minutes"] = rng.randint(1, 4)
            register_issue(issues_by_row, issue_tally, idx, "duration_anomaly_short", enum_id)

    for enum_id, count in duration_impossible.items():
        candidates = choose_indices_where(rows, enum_id, lambda row: row["duration_minutes"] != "")
        for idx in choose_indices(candidates, count, rng):
            rows[idx]["duration_minutes"] = 0 if rng.random() < 0.5 else -rng.randint(1, 5)
            register_issue(issues_by_row, issue_tally, idx, "duration_anomaly_impossible", enum_id)

    for enum_id, count in duration_long.items():
        candidates = choose_indices_where(rows, enum_id, lambda row: row["duration_minutes"] != "")
        for idx in choose_indices(candidates, count, rng):
            rows[idx]["duration_minutes"] = rng.randint(180, 360)
            register_issue(issues_by_row, issue_tally, idx, "duration_anomaly_long", enum_id)

    for enum_id, count in duration_heaped.items():
        candidates = choose_indices_where(rows, enum_id, lambda row: row["duration_minutes"] != "")
        for idx in choose_indices(candidates, count, rng):
            rows[idx]["duration_minutes"] = rng.choice([5, 10, 15])
            register_issue(issues_by_row, issue_tally, idx, "duration_anomaly_heaped", enum_id)

    outlier_generators = {
        "respondent_age": lambda _rng: _rng.choice([_rng.randint(8, 16), _rng.randint(99, 108)]),
        "household_size": lambda _rng: _rng.randint(15, 25),
        "monthly_income": lambda _rng: _rng.randint(18000, 42000),
        "monthly_expenditure": lambda _rng: _rng.randint(15000, 36000),
        "asset_count": lambda _rng: _rng.randint(25, 60),
    }
    outlier_enum_weights = ["E19"] * 5 + ["E07"] * 4 + ["E14"] * 3 + ["E03"] * 2 + list(ENUMERATOR_ROW_COUNTS.keys())
    for column, count in NUMERIC_OUTLIER_COUNTS.items():
        chosen: set[int] = set()
        while len(chosen) < count:
            enum_id = rng.choice(outlier_enum_weights)
            candidates = choose_indices_where(rows, enum_id, lambda row: row[column] != "")
            if not candidates:
                continue
            chosen.add(rng.choice(candidates))
        for idx in chosen:
            rows[idx][column] = outlier_generators[column](rng)
            register_issue(issues_by_row, issue_tally, idx, f"numeric_outlier_{column}", rows[idx]["enumerator_id"])

    consistency_rows = choose_indices(
        [idx for idx, row in enumerate(rows) if row["monthly_income"] not in ("", None) and row["monthly_expenditure"] not in ("", None)],
        60,
        rng,
    )
    for idx in consistency_rows:
        income = max(120, int(rows[idx]["monthly_income"]))
        rows[idx]["monthly_expenditure"] = int(round(income * rng.uniform(2.6, 3.8)))
        register_issue(issues_by_row, issue_tally, idx, "consistency_expenditure_gt_income", rows[idx]["enumerator_id"])

    underage_rows = choose_indices(
        [idx for idx, row in enumerate(rows) if row["respondent_age"] not in ("", None)],
        25,
        rng,
    )
    for idx in underage_rows:
        rows[idx]["respondent_age"] = rng.randint(12, 17)
        register_issue(issues_by_row, issue_tally, idx, "consistency_underage_respondent", rows[idx]["enumerator_id"])

    single_high_spend_rows = choose_indices(
        [
            idx
            for idx, row in enumerate(rows)
            if row["monthly_expenditure"] not in ("", None) and row["household_size"] not in ("", None)
        ],
        20,
        rng,
    )
    for idx in single_high_spend_rows:
        rows[idx]["household_size"] = 1
        rows[idx]["monthly_expenditure"] = max(int(rows[idx]["monthly_expenditure"]), rng.randint(9000, 18000))
        register_issue(issues_by_row, issue_tally, idx, "consistency_singleton_high_spend", rows[idx]["enumerator_id"])

    no_asset_high_income_rows = choose_indices(
        [
            idx
            for idx, row in enumerate(rows)
            if row["monthly_income"] not in ("", None) and row["asset_count"] not in ("", None)
        ],
        20,
        rng,
    )
    for idx in no_asset_high_income_rows:
        rows[idx]["asset_count"] = 0
        rows[idx]["monthly_income"] = max(int(rows[idx]["monthly_income"]), rng.randint(12000, 24000))
        register_issue(issues_by_row, issue_tally, idx, "consistency_zero_assets_high_income", rows[idx]["enumerator_id"])

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    enum_daily_counts: dict[str, Counter[str]] = defaultdict(Counter)
    enum_row_counts: Counter[str] = Counter()
    for row in rows:
        enum_id = row["enumerator_id"]
        enum_row_counts[enum_id] += 1
        if row["survey_date"]:
            enum_daily_counts[enum_id][str(row["survey_date"])] += 1

    anomalies: dict[str, Any] = {}
    duplicate_rows = sum(issue_tally["duplicate_id"].values())
    anomalies["duplicate_id"] = {
        "total_rows": duplicate_rows,
        "by_enumerator": dict(issue_tally["duplicate_id"]),
        "notes": "Rows whose id value was replaced with an existing id from another record.",
    }

    missing_summary: dict[str, Any] = {}
    for column in MISSINGNESS_RATES:
        key = f"missing_{column}"
        missing_summary[column] = {
            "total_rows": sum(issue_tally[key].values()),
            "by_enumerator": dict(issue_tally[key]),
        }
    anomalies["missingness"] = missing_summary

    duration_keys = [
        "duration_anomaly_short",
        "duration_anomaly_impossible",
        "duration_anomaly_long",
        "duration_anomaly_heaped",
    ]
    anomalies["duration_anomaly"] = {
        "total_rows": sum(sum(issue_tally[key].values()) for key in duration_keys),
        "by_subtype": {key: {"total_rows": sum(issue_tally[key].values()), "by_enumerator": dict(issue_tally[key])} for key in duration_keys},
    }

    outlier_summary: dict[str, Any] = {}
    for column in NUMERIC_OUTLIER_COUNTS:
        key = f"numeric_outlier_{column}"
        outlier_summary[column] = {
            "total_rows": sum(issue_tally[key].values()),
            "by_enumerator": dict(issue_tally[key]),
        }
    anomalies["numeric_outlier"] = outlier_summary

    consistency_keys = [
        "consistency_expenditure_gt_income",
        "consistency_underage_respondent",
        "consistency_singleton_high_spend",
        "consistency_zero_assets_high_income",
    ]
    anomalies["consistency_anomaly"] = {
        "total_rows": sum(sum(issue_tally[key].values()) for key in consistency_keys),
        "by_subtype": {key: {"total_rows": sum(issue_tally[key].values()), "by_enumerator": dict(issue_tally[key])} for key in consistency_keys},
    }

    productivity_summary: dict[str, Any] = {}
    median_productivity = sorted(enum_row_counts.values())[len(enum_row_counts) // 2]
    for enum_id in ENUMERATOR_ROW_COUNTS:
        daily_counts = enum_daily_counts[enum_id]
        active_days = len(daily_counts)
        productivity_summary[enum_id] = {
            "row_count": enum_row_counts[enum_id],
            "active_days": active_days,
            "avg_interviews_per_active_day": round(enum_row_counts[enum_id] / active_days, 2) if active_days else 0,
            "max_interviews_on_single_day": max(daily_counts.values()) if daily_counts else 0,
            "relative_to_median_rows": round(enum_row_counts[enum_id] / median_productivity, 2),
            "issue_counts": dict(issue_tally_key_count(issue_tally, enum_id)),
        }

    anomalies["productivity_anomaly"] = {
        "high_productivity_enumerators": list(HIGH_PRODUCTIVITY_ENUMERATORS),
        "low_productivity_enumerators": list(LOW_PRODUCTIVITY_ENUMERATORS),
        "median_rows_per_enumerator": median_productivity,
        "enumerators": productivity_summary,
    }

    manifest = {
        "dataset_name": "sample_survey",
        "rows": len(rows),
        "seed": args.seed,
        "date_range": {"start": DATE_START.isoformat(), "end": DATE_END.isoformat()},
        "columns": COLUMNS,
        "enumerators": list(ENUMERATOR_ROW_COUNTS.keys()),
        "high_error_enumerators": list(HIGH_ERROR_ENUMERATORS),
        "high_productivity_enumerators": list(HIGH_PRODUCTIVITY_ENUMERATORS),
        "low_productivity_enumerators": list(LOW_PRODUCTIVITY_ENUMERATORS),
        "anomalies": anomalies,
        "expected_current_checks": [
            "CHK-001 duplicate IDs should fire on repeated id values.",
            "CHK-002 missingness should flag monthly_income and monthly_expenditure as elevated.",
            "CHK-008 outlier z-score should flag duration_minutes and multiple economic variables.",
        ],
        "expected_future_checks": [
            "Enumerator productivity review should highlight E19 and E07 for unusually high volume.",
            "Duration anomaly checks should surface short, impossible, and long interviews.",
            "Cross-variable consistency checks should catch expenditure-income and asset-income contradictions.",
        ],
    }

    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    with args.manifest.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"Wrote dataset to {args.out}")
    print(f"Wrote manifest to {args.manifest}")
    return 0


def issue_tally_key_count(issue_tally: dict[str, Counter[str]], enum_id: str) -> Counter[str]:
    counts: Counter[str] = Counter()
    for issue_name, enum_counts in issue_tally.items():
        if enum_counts[enum_id]:
            counts[issue_name] = enum_counts[enum_id]
    return counts


if __name__ == "__main__":
    raise SystemExit(main())
