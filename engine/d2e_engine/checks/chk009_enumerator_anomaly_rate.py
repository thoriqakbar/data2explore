"""CHK-009  Enumerator Anomaly Rate — meta-check that flags enumerators with disproportionate flag counts."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from d2e_engine.checks.base import FlagRow, build_flag_row

logger = logging.getLogger(__name__)

CHECK_ID = "CHK-009"
CHECK_NAME = "Enumerator Anomaly Rate"
SEVERITY = "Warning"
REQUIRED_MAPPING_FIELDS = ("enumerator_id",)

# Sentinel: run() accepts prior_flags via config so it can aggregate across checks
# that have already run in this pipeline invocation.


def run(
    df: pd.DataFrame,
    mapping: dict[str, str],
    config: dict[str, Any],
    run_id: str,
) -> list[FlagRow]:
    enum_col = mapping["enumerator_id"]
    if enum_col not in df.columns:
        logger.warning("CHK-009: enumerator column '%s' not found — skipping", enum_col)
        return []

    prior_flags: list[dict[str, str]] = config.get("_prior_flags_for_aggregation", [])
    if not prior_flags:
        logger.info("CHK-009: no prior flags to aggregate — skipping")
        return []

    deviation_factor = config.get("enumerator_anomaly_deviation", 2.0)
    min_flags_threshold = config.get("enumerator_anomaly_min_flags", 5)

    # Count flags per enumerator from all prior checks (excluding CHK-009 itself)
    flag_counts: dict[str, int] = {}
    for flag in prior_flags:
        check_id = flag.get("check_id", "")
        if check_id == CHECK_ID:
            continue
        eid = flag.get("enumerator_id", "")
        if eid:
            flag_counts[eid] = flag_counts.get(eid, 0) + 1

    if not flag_counts:
        return []

    # Compute median flag count across enumerators present in data
    all_enumerators = df[enum_col].dropna().unique()
    counts = [flag_counts.get(str(e), 0) for e in all_enumerators]
    counts.sort()
    n = len(counts)
    if n == 0:
        return []
    median_count = counts[n // 2] if n % 2 == 1 else (counts[n // 2 - 1] + counts[n // 2]) / 2

    # Also compute row counts per enumerator for rate calculation
    enum_row_counts = df[enum_col].value_counts().to_dict()

    flags: list[FlagRow] = []
    for enum_id, count in flag_counts.items():
        if count < min_flags_threshold:
            continue
        if median_count > 0 and count <= median_count * deviation_factor:
            continue

        row_count = enum_row_counts.get(enum_id, 0)
        rate = count / row_count if row_count > 0 else 0

        severity = "Critical" if median_count > 0 and count > median_count * (deviation_factor * 2) else SEVERITY

        flags.append(
            build_flag_row(
                run_id=run_id,
                check_id=CHECK_ID,
                check_name=CHECK_NAME,
                severity=severity,
                id="",
                enumerator_id=str(enum_id),
                module="",
                column_name="",
                observed_value=f"{count} flags ({rate:.1%} of {row_count} rows)",
                rule_reference=f"flags {count} > {deviation_factor}x median {median_count:.0f}",
                message=(
                    f"Enumerator {enum_id} has {count} flags across all checks "
                    f"({rate:.1%} flag rate) vs median {median_count:.0f}"
                ),
            )
        )

    return flags
