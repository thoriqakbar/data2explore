from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


def build_performance(
    df: pd.DataFrame,
    mapping: dict[str, str],
    config: dict[str, Any],
    check_summary_path: str | Path | None = None,
) -> dict[str, Any]:
    """Build survey performance metrics from a dataset.

    Returns a dict matching the PerformanceOutput schema.
    """
    warnings: list[str] = []
    errors: list[str] = []

    # --- Resolve mapped columns ---
    date_col = mapping.get("survey_date")
    enum_col = mapping.get("enumerator_id")
    id_col = mapping.get("id")

    if not date_col or date_col not in df.columns:
        return {
            "ok": False,
            "daily_completions": [],
            "enumerator_stats": [],
            "duration_stats": None,
            "daily_by_enumerator": None,
            "totals": None,
            "warnings": warnings,
            "errors": ["survey_date mapping is required for performance metrics."],
        }

    # --- Parse dates ---
    dates = pd.to_datetime(df[date_col], errors="coerce")
    unparseable = int(dates.isna().sum() - df[date_col].isna().sum())
    if unparseable > 0:
        warnings.append(f"{unparseable} row(s) had unparseable date values in '{date_col}'.")
    df = df.copy()
    df["_d2e_date"] = dates

    valid_mask = df["_d2e_date"].notna()
    df_valid = df[valid_mask]

    # --- Daily completions ---
    daily = (
        df_valid.groupby(df_valid["_d2e_date"].dt.date)
        .size()
        .reset_index(name="count")
    )
    daily.columns = ["date", "count"]
    daily = daily.sort_values("date")
    daily["cumulative"] = daily["count"].cumsum()
    daily_completions = [
        {
            "date": str(row["date"]),
            "count": int(row["count"]),
            "cumulative": int(row["cumulative"]),
        }
        for _, row in daily.iterrows()
    ]

    # --- Totals ---
    total_surveys = len(df)
    unique_enumerators = int(df_valid[enum_col].nunique()) if enum_col and enum_col in df.columns else 0
    first_date = str(daily.iloc[0]["date"]) if len(daily) else None
    last_date = str(daily.iloc[-1]["date"]) if len(daily) else None
    date_range_days = (daily.iloc[-1]["date"] - daily.iloc[0]["date"]).days + 1 if len(daily) > 0 else 0

    totals = {
        "total_surveys": total_surveys,
        "total_enumerators": unique_enumerators,
        "date_range_days": date_range_days,
        "first_date": first_date,
        "last_date": last_date,
    }

    # --- Duration stats ---
    duration_mode = config.get("duration_mode", "column")
    duration_col = config.get("duration_column", "duration_minutes")
    dur_label = ""
    dur_series_raw: pd.Series | None = None

    if duration_mode == "start_end":
        start_col = config.get("duration_start_column", "")
        end_col = config.get("duration_end_column", "")
        if start_col and end_col and start_col in df.columns and end_col in df.columns:
            start = pd.to_datetime(df[start_col], errors="coerce")
            end = pd.to_datetime(df[end_col], errors="coerce")
            dur_series_raw = (end - start).dt.total_seconds() / 60
            dur_label = f"{start_col}→{end_col}"
    elif duration_mode != "none" and duration_col and duration_col in df.columns:
        dur_series_raw = pd.to_numeric(df[duration_col], errors="coerce")
        unit = config.get("duration_unit", "minutes")
        if unit == "seconds":
            dur_series_raw = dur_series_raw / 60
        dur_label = duration_col

    duration_stats: dict[str, Any] | None = None
    if dur_series_raw is not None:
        dur_series = dur_series_raw.dropna()
        if len(dur_series) > 0:
            counts, bin_edges = np.histogram(dur_series.values, bins=20)
            histogram = [
                {"bin_start": float(bin_edges[i]), "bin_end": float(bin_edges[i + 1]), "count": int(counts[i])}
                for i in range(len(counts))
            ]
            duration_stats = {
                "column": dur_label,
                "overall_mean": float(dur_series.mean()),
                "overall_median": float(dur_series.median()),
                "overall_std": float(dur_series.std()) if len(dur_series) > 1 else None,
                "overall_min": float(dur_series.min()),
                "overall_max": float(dur_series.max()),
                "histogram": histogram,
            }

    # --- Load check summary for flag counts ---
    flag_counts_by_enum: dict[str, int] = {}
    if check_summary_path:
        try:
            with Path(check_summary_path).open("r", encoding="utf-8") as f:
                check_summary = json.load(f)
            flag_counts_by_enum = check_summary.get("by_enumerator", {})
            # Ensure values are ints
            flag_counts_by_enum = {k: int(v) for k, v in flag_counts_by_enum.items()}
        except Exception:
            warnings.append("Could not load check summary for enumerator flag counts.")

    # --- Enumerator stats ---
    enumerator_stats: list[dict[str, Any]] = []
    if enum_col and enum_col in df.columns:
        for enum_id, group in df_valid.groupby(enum_col):
            enum_dates = group["_d2e_date"].dt.date
            active_days = int(enum_dates.nunique())
            total = len(group)

            row: dict[str, Any] = {
                "enumerator_id": str(enum_id),
                "total_surveys": total,
                "first_date": str(enum_dates.min()),
                "last_date": str(enum_dates.max()),
                "active_days": active_days,
                "surveys_per_day": round(total / active_days, 1) if active_days > 0 else 0,
                "avg_duration": None,
                "median_duration": None,
                "min_duration": None,
                "max_duration": None,
                "flag_count": flag_counts_by_enum.get(str(enum_id), 0),
            }

            if dur_series_raw is not None:
                dur = dur_series_raw.loc[group.index].dropna()
                if len(dur) > 0:
                    row["avg_duration"] = round(float(dur.mean()), 1)
                    row["median_duration"] = round(float(dur.median()), 1)
                    row["min_duration"] = round(float(dur.min()), 1)
                    row["max_duration"] = round(float(dur.max()), 1)

            enumerator_stats.append(row)

        enumerator_stats.sort(key=lambda r: r["total_surveys"], reverse=True)

    # --- Daily by enumerator (cap at 30) ---
    daily_by_enumerator: list[dict[str, Any]] | None = None
    if enum_col and enum_col in df.columns and unique_enumerators <= 30:
        dbe = (
            df_valid.groupby([df_valid["_d2e_date"].dt.date, enum_col])
            .size()
            .reset_index(name="count")
        )
        dbe.columns = ["date", "enumerator_id", "count"]
        daily_by_enumerator = [
            {
                "date": str(row["date"]),
                "enumerator_id": str(row["enumerator_id"]),
                "count": int(row["count"]),
            }
            for _, row in dbe.iterrows()
        ]

    return {
        "ok": True,
        "daily_completions": daily_completions,
        "enumerator_stats": enumerator_stats,
        "duration_stats": duration_stats,
        "daily_by_enumerator": daily_by_enumerator,
        "totals": totals,
        "warnings": warnings,
        "errors": errors,
    }
