"""CHK-008  Outlier Z-score — flag rows where |z| > threshold for numeric columns."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from d2e_engine.checks.base import FlagRow, build_flag_row, fmt_survey_date
from d2e_engine.summarize import summarize_numeric

logger = logging.getLogger(__name__)

CHECK_ID = "CHK-008"
CHECK_NAME = "Outlier Z-score"
SEVERITY = "Warning"
REQUIRED_MAPPING_FIELDS = ()
MIN_STD_DEV = 1e-9


def run(
    df: pd.DataFrame,
    mapping: dict[str, str],
    config: dict[str, Any],
    run_id: str,
) -> list[FlagRow]:
    threshold = config.get("zscore_threshold", 3.0)
    excluded: set[str] = set(config.get("excluded_columns", []))

    id_col = mapping.get("id", "")
    enum_col = mapping.get("enumerator_id", "")
    date_col = mapping.get("survey_date", "")

    # Build lookup of mean/std from summarize_numeric
    stats_by_col: dict[str, dict[str, Any]] = {}
    for row in summarize_numeric(df, excluded or None):
        std = row.get("std_dev")
        mean = row.get("mean")
        if std is not None and std >= MIN_STD_DEV and mean is not None:
            stats_by_col[row["variable"]] = {"mean": mean, "std": std}

    if not stats_by_col:
        return []

    flags: list[FlagRow] = []
    for col, stats in stats_by_col.items():
        if col in excluded:
            continue
        mean = stats["mean"]
        std = stats["std"]
        series = df[col]

        for idx, val in series.items():
            if pd.isna(val):
                continue
            z = (float(val) - mean) / std
            if abs(z) > threshold:
                row_data = df.loc[idx]
                flags.append(
                    build_flag_row(
                        run_id=run_id,
                        check_id=CHECK_ID,
                        check_name=CHECK_NAME,
                        severity=SEVERITY,
                        id=row_data.get(id_col, "") if id_col and id_col in df.columns else "",
                        enumerator_id=row_data.get(enum_col, "") if enum_col and enum_col in df.columns else "",
                        survey_date=fmt_survey_date(row_data.get(date_col, "")) if date_col and date_col in df.columns else "",
                        column_name=col,
                        observed_value=val,
                        rule_reference=f"|z| > {threshold}",
                        message=f"Outlier in '{col}': value={val}, z-score={z:.2f}",
                    )
                )

    return flags
