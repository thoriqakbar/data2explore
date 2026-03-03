"""CHK-012  Allowed Values — flag rows where values are not in the allowed set."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from d2e_engine.checks.base import FlagRow, build_flag_row, fmt_survey_date

logger = logging.getLogger(__name__)

CHECK_ID = "CHK-012"
CHECK_NAME = "Allowed Values"
SEVERITY = "Critical"
REQUIRED_MAPPING_FIELDS = ()


def run(
    df: pd.DataFrame,
    mapping: dict[str, str],
    config: dict[str, Any],
    run_id: str,
) -> list[FlagRow]:
    rules: list[dict[str, Any]] = config.get("allowed_values_rules", [])
    if not rules:
        return []

    excluded: set[str] = set(config.get("excluded_columns", []))

    id_col = mapping.get("id", "")
    enum_col = mapping.get("enumerator_id", "")
    date_col = mapping.get("survey_date", "")

    flags: list[FlagRow] = []

    for rule in rules:
        col = rule.get("column", "")
        if not col or col not in df.columns:
            logger.info("Allowed-values column '%s' not found — skipping", col)
            continue
        if col in excluded:
            continue

        allowed = rule.get("values", [])
        if not allowed:
            continue

        allowed_set = set(str(v) for v in allowed)
        allowed_display = ", ".join(sorted(allowed_set))

        for idx, val in df[col].items():
            if pd.isna(val):
                continue  # missingness is CHK-002's domain
            str_val = str(val)
            if str_val not in allowed_set:
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
                        observed_value=str_val,
                        rule_reference=f"value '{str_val}' not in {{{allowed_display}}}",
                        message=f"Value '{str_val}' in '{col}' is not in allowed set: {{{allowed_display}}}",
                    )
                )

    return flags
