"""CHK-004  Missingness by Enumerator — flag enumerators whose per-variable missing rate deviates from the dataset baseline."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from d2e_engine.checks.base import FlagRow, build_flag_row

logger = logging.getLogger(__name__)

CHECK_ID = "CHK-004"
CHECK_NAME = "Missingness by Enumerator"
SEVERITY = "Warning"
REQUIRED_MAPPING_FIELDS = ("enumerator_id",)


def run(
    df: pd.DataFrame,
    mapping: dict[str, str],
    config: dict[str, Any],
    run_id: str,
) -> list[FlagRow]:
    enum_col = mapping["enumerator_id"]
    if enum_col not in df.columns:
        logger.warning("CHK-004: enumerator column '%s' not found — skipping", enum_col)
        return []

    deviation_factor = config.get("missingness_enumerator_deviation", 2.0)
    min_rows_per_enum = config.get("missingness_enumerator_min_rows", 10)

    id_col = mapping.get("id", "")

    # Columns to analyse: all except the mapping columns themselves
    mapping_cols = {v for v in mapping.values() if v}
    analysis_cols = [c for c in df.columns if c not in mapping_cols]

    if not analysis_cols:
        return []

    grouped = df.groupby(enum_col)
    flags: list[FlagRow] = []

    for col in analysis_cols:
        # Dataset-wide baseline missing rate for this column
        total_missing = df[col].isna().sum() + (df[col] == "").sum()
        baseline_rate = total_missing / len(df) if len(df) > 0 else 0

        # Skip columns with near-zero baseline (no meaningful missingness to compare)
        if baseline_rate < 0.01:
            continue

        for enum_id, group in grouped:
            if len(group) < min_rows_per_enum:
                continue

            enum_missing = group[col].isna().sum() + (group[col] == "").sum()
            enum_rate = enum_missing / len(group)

            # Flag if enumerator's rate exceeds baseline by the deviation factor
            if enum_rate > baseline_rate * deviation_factor and enum_missing > 0:
                severity = "Critical" if enum_rate > baseline_rate * (deviation_factor * 2) else SEVERITY

                flags.append(
                    build_flag_row(
                        run_id=run_id,
                        check_id=CHECK_ID,
                        check_name=CHECK_NAME,
                        severity=severity,
                        id="",
                        enumerator_id=str(enum_id),
                        column_name=col,
                        observed_value=f"{enum_missing}/{len(group)} ({enum_rate:.1%})",
                        rule_reference=f"enumerator rate {enum_rate:.1%} > {deviation_factor}x baseline {baseline_rate:.1%}",
                        message=(
                            f"Enumerator {enum_id} has {enum_rate:.1%} missing in '{col}' "
                            f"({enum_missing}/{len(group)}) vs baseline {baseline_rate:.1%}"
                        ),
                    )
                )

    return flags
