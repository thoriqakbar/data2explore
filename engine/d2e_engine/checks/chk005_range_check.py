"""CHK-005  Range Check — flag rows where values fall outside user-defined min/max bounds."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from d2e_engine.checks.base import FlagRow, build_flag_row

logger = logging.getLogger(__name__)

CHECK_ID = "CHK-005"
CHECK_NAME = "Range Check"
SEVERITY = "Critical"
REQUIRED_MAPPING_FIELDS = ()


def run(
    df: pd.DataFrame,
    mapping: dict[str, str],
    config: dict[str, Any],
    run_id: str,
) -> list[FlagRow]:
    range_rules: list[dict[str, Any]] = config.get("range_rules", [])
    if not range_rules:
        return []

    excluded: set[str] = set(config.get("excluded_columns", []))

    id_col = mapping.get("id", "")
    enum_col = mapping.get("enumerator_id", "")

    flags: list[FlagRow] = []

    for rule in range_rules:
        col = rule.get("column", "")
        if not col or col not in df.columns:
            logger.info("Range rule column '%s' not found in data — skipping", col)
            continue
        if col in excluded:
            continue

        rule_min = rule.get("min")
        rule_max = rule.get("max")
        if rule_min is None and rule_max is None:
            continue

        # Build human-readable rule reference
        parts = []
        if rule_min is not None:
            parts.append(f">= {rule_min}")
        if rule_max is not None:
            parts.append(f"<= {rule_max}")
        rule_ref = f"{col}: {' and '.join(parts)}"

        for idx, val in df[col].items():
            if pd.isna(val):
                continue
            try:
                num_val = float(val)
            except (ValueError, TypeError):
                continue

            out_of_range = False
            if rule_min is not None and num_val < rule_min:
                out_of_range = True
            if rule_max is not None and num_val > rule_max:
                out_of_range = True

            if out_of_range:
                row_data = df.loc[idx]
                flags.append(
                    build_flag_row(
                        run_id=run_id,
                        check_id=CHECK_ID,
                        check_name=CHECK_NAME,
                        severity=SEVERITY,
                        id=row_data.get(id_col, "") if id_col and id_col in df.columns else "",
                        enumerator_id=row_data.get(enum_col, "") if enum_col and enum_col in df.columns else "",
                        column_name=col,
                        observed_value=val,
                        rule_reference=rule_ref,
                        message=f"Value {num_val} in '{col}' is outside range [{rule_min}, {rule_max}]",
                    )
                )

    return flags
