"""CHK-010  Interview Duration Anomaly — flag rows with impossible, short, long, or heaped durations."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from d2e_engine.checks.base import FlagRow, build_flag_row

logger = logging.getLogger(__name__)

CHECK_ID = "CHK-010"
CHECK_NAME = "Interview Duration Anomaly"
SEVERITY = "Warning"
REQUIRED_MAPPING_FIELDS = ()


def _resolve_duration_series(df: pd.DataFrame, config: dict[str, Any]) -> tuple[pd.Series | None, str]:
    """Resolve a duration series (in minutes) based on config mode.

    Returns (series_or_None, label_for_column_name).
    """
    mode = config.get("duration_mode", "column")

    if mode == "none":
        return None, ""

    if mode == "start_end":
        start_col = config.get("duration_start_column", "")
        end_col = config.get("duration_end_column", "")
        if not start_col or not end_col:
            logger.warning("CHK-010: start_end mode but missing column names — skipping")
            return None, ""
        if start_col not in df.columns or end_col not in df.columns:
            logger.warning("CHK-010: start_end columns '%s'/'%s' not found — skipping", start_col, end_col)
            return None, ""
        start = pd.to_datetime(df[start_col], errors="coerce")
        end = pd.to_datetime(df[end_col], errors="coerce")
        duration_minutes = (end - start).dt.total_seconds() / 60
        return duration_minutes, f"{start_col}→{end_col}"

    # Default: column mode
    duration_col = config.get("duration_column", "duration_minutes")
    if not duration_col or duration_col not in df.columns:
        logger.warning("CHK-010: duration column '%s' not found — skipping", duration_col)
        return None, ""

    series = pd.to_numeric(df[duration_col], errors="coerce")
    unit = config.get("duration_unit", "minutes")
    if unit == "seconds":
        series = series / 60
    return series, duration_col


def run(
    df: pd.DataFrame,
    mapping: dict[str, str],
    config: dict[str, Any],
    run_id: str,
) -> list[FlagRow]:
    deviation_factor = config.get("duration_deviation_factor", 3.0)
    min_obs = config.get("duration_min_observations", 5)
    heaping_multiple = config.get("heaping_multiple", 5)
    heaping_ceiling = config.get("heaping_ceiling", 15)

    duration_series, col_label = _resolve_duration_series(df, config)
    if duration_series is None:
        return []

    id_col = mapping.get("id", "")
    enum_col = mapping.get("enumerator_id", "")
    module_col = mapping.get("module", "")

    # Compute median & MAD from valid positive durations
    valid = duration_series.dropna()
    valid = valid[valid > 0]

    use_relative = len(valid) >= min_obs
    if use_relative:
        median_dur = valid.median()
        mad = (valid - median_dur).abs().median()
        # If MAD is 0 (constant durations), skip relative detection
        if mad == 0:
            use_relative = False
        else:
            lower_bound = median_dur - deviation_factor * mad
            upper_bound = median_dur + deviation_factor * mad

    flags: list[FlagRow] = []

    for idx, num in duration_series.items():
        if pd.isna(num):
            continue

        subtype: str | None = None
        severity = SEVERITY
        message = ""

        if num <= 0:
            subtype = "impossible"
            severity = "Critical"
            message = f"Impossible duration: {num:.1f} minutes (must be > 0)"
        elif use_relative and num < lower_bound:
            subtype = "short"
            message = (
                f"Unusually short: {num:.1f} min "
                f"(median {median_dur:.1f}, threshold {lower_bound:.1f})"
            )
        elif use_relative and num > upper_bound:
            subtype = "long"
            message = (
                f"Unusually long: {num:.1f} min "
                f"(median {median_dur:.1f}, threshold {upper_bound:.1f})"
            )
        elif (
            heaping_multiple > 0
            and num <= heaping_ceiling
            and num % heaping_multiple == 0
        ):
            subtype = "heaped"
            message = f"Heaped duration: {num:.1f} minutes (multiple of {heaping_multiple}, ceiling {heaping_ceiling})"

        if subtype is None:
            continue

        row_data = df.loc[idx]
        flags.append(
            build_flag_row(
                run_id=run_id,
                check_id=CHECK_ID,
                check_name=CHECK_NAME,
                severity=severity,
                id=row_data.get(id_col, "") if id_col and id_col in df.columns else "",
                enumerator_id=row_data.get(enum_col, "") if enum_col and enum_col in df.columns else "",
                module=row_data.get(module_col, "") if module_col and module_col in df.columns else "",
                column_name=col_label,
                observed_value=f"{num:.1f}",
                rule_reference=f"duration_{subtype}",
                message=message,
            )
        )

    return flags
