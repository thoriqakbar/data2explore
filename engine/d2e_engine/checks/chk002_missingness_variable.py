"""CHK-002  Missingness by Variable — flag columns where missing rate exceeds threshold."""

from __future__ import annotations

from typing import Any

import pandas as pd

from d2e_engine.checks.base import FlagRow, build_flag_row
from d2e_engine.profile import profile_dataframe

CHECK_ID = "CHK-002"
CHECK_NAME = "Missingness by Variable"


def run(
    df: pd.DataFrame,
    mapping: dict[str, str],
    config: dict[str, Any],
    run_id: str,
) -> list[FlagRow]:
    warning_threshold = config.get("missing_warning_threshold", 0.20)
    critical_threshold = config.get("missing_critical_threshold", 0.50)

    profile = profile_dataframe(df)
    row_count = profile["row_count"]
    if row_count == 0:
        return []

    flags: list[FlagRow] = []
    for col_info in profile["columns"]:
        missing = col_info["missing_count"]
        rate = missing / row_count

        if rate > critical_threshold:
            severity = "Critical"
        elif rate > warning_threshold:
            severity = "Warning"
        else:
            continue

        flags.append(
            build_flag_row(
                run_id=run_id,
                check_id=CHECK_ID,
                check_name=CHECK_NAME,
                severity=severity,
                id="",
                column_name=col_info["name"],
                observed_value=f"{missing}/{row_count}",
                rule_reference=f"missing rate {rate:.2%} > {warning_threshold if severity == 'Warning' else critical_threshold}",
                message=f"Column '{col_info['name']}' has {rate:.1%} missing values ({missing}/{row_count})",
            )
        )

    return flags
