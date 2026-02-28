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


def run(
    df: pd.DataFrame,
    mapping: dict[str, str],
    config: dict[str, Any],
    run_id: str,
) -> list[FlagRow]:
    duration_col = config.get("duration_column", "duration_minutes")
    min_dur = config.get("min_duration_minutes", 5)
    max_dur = config.get("max_duration_minutes", 120)
    heaping_multiple = config.get("heaping_multiple", 5)
    heaping_ceiling = config.get("heaping_ceiling", 15)

    if duration_col not in df.columns:
        logger.warning("CHK-010: duration column '%s' not found — skipping", duration_col)
        return []

    id_col = mapping.get("id", "")
    enum_col = mapping.get("enumerator_id", "")
    module_col = mapping.get("module", "")

    flags: list[FlagRow] = []

    for idx, val in df[duration_col].items():
        if pd.isna(val) or val == "":
            continue
        try:
            num = float(val)
        except (ValueError, TypeError):
            continue

        subtype: str | None = None
        severity = SEVERITY
        message = ""

        if num <= 0:
            subtype = "impossible"
            severity = "Critical"
            message = f"Impossible duration: {num} minutes (must be > 0)"
        elif num < min_dur:
            subtype = "short"
            message = f"Short interview: {num} minutes (threshold: {min_dur})"
        elif num > max_dur:
            subtype = "long"
            message = f"Long interview: {num} minutes (threshold: {max_dur})"
        elif (
            heaping_multiple > 0
            and num <= heaping_ceiling
            and num % heaping_multiple == 0
        ):
            subtype = "heaped"
            message = f"Heaped duration: {num} minutes (multiple of {heaping_multiple}, ceiling {heaping_ceiling})"

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
                column_name=duration_col,
                observed_value=val,
                rule_reference=f"duration_{subtype}",
                message=message,
            )
        )

    return flags
