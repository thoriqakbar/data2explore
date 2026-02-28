"""CHK-001  Duplicate ID — flag rows where the id column value appears more than once."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from d2e_engine.checks.base import FlagRow, build_flag_row

logger = logging.getLogger(__name__)

CHECK_ID = "CHK-001"
CHECK_NAME = "Duplicate ID"
SEVERITY = "Critical"
REQUIRED_MAPPING_FIELDS = ("id",)


def run(
    df: pd.DataFrame,
    mapping: dict[str, str],
    config: dict[str, Any],
    run_id: str,
) -> list[FlagRow]:
    id_col = mapping.get("id")
    if id_col is None or id_col not in df.columns:
        logger.warning("CHK-001: id column '%s' not found in data — skipping", id_col)
        return []

    enum_col = mapping.get("enumerator_id", "")
    module_col = mapping.get("module", "")

    # Find values that appear more than once (excluding NaN)
    counts = df[id_col].value_counts()
    duplicate_values = set(counts[counts > 1].index)

    if not duplicate_values:
        return []

    flags: list[FlagRow] = []
    for idx, row in df.iterrows():
        val = row[id_col]
        # Skip NaN — missingness is handled by CHK-002
        if pd.isna(val):
            continue
        if val in duplicate_values:
            flags.append(
                build_flag_row(
                    run_id=run_id,
                    check_id=CHECK_ID,
                    check_name=CHECK_NAME,
                    severity=SEVERITY,
                    id=val,
                    enumerator_id=row.get(enum_col, "") if enum_col else "",
                    module=row.get(module_col, "") if module_col else "",
                    column_name=id_col,
                    observed_value=val,
                    rule_reference="id appears >1 time",
                    message=f"Duplicate ID: {val} (count={int(counts[val])})",
                )
            )

    return flags
