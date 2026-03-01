from __future__ import annotations

import logging
from types import ModuleType
from typing import Any

import pandas as pd

from d2e_engine.checks.base import FlagRow
from d2e_engine.checks import (
    chk001_duplicate_id,
    chk002_missingness_variable,
    chk004_missingness_enumerator,
    chk005_range_check,
    chk008_outlier_zscore,
    chk010_duration_anomaly,
    chk012_allowed_values,
    chk009_enumerator_anomaly_rate,
)

logger = logging.getLogger(__name__)

# CHK-009 must be last: it aggregates flags from all preceding checks.
_CHECKS: list[ModuleType] = [
    chk001_duplicate_id,
    chk002_missingness_variable,
    chk004_missingness_enumerator,
    chk005_range_check,
    chk008_outlier_zscore,
    chk010_duration_anomaly,
    chk012_allowed_values,
    chk009_enumerator_anomaly_rate,  # must be last: aggregates prior flags
]

_CHECK_BY_ID: dict[str, ModuleType] = {
    getattr(m, "CHECK_ID"): m for m in _CHECKS
}


def get_available_check_ids() -> list[str]:
    """Return ordered list of all registered check IDs."""
    return [getattr(m, "CHECK_ID") for m in _CHECKS]


def _check_can_run(check_module: ModuleType, mapping: dict[str, str]) -> str | None:
    """Return None if the check can run, or a reason string if it cannot."""
    required: tuple[str, ...] = getattr(check_module, "REQUIRED_MAPPING_FIELDS", ())
    missing = [f for f in required if f not in mapping]
    if missing:
        return f"missing mapping field(s): {', '.join(missing)}"
    return None


def run_checks(
    df: pd.DataFrame,
    mapping: dict[str, str],
    config: dict[str, Any],
    run_id: str,
    selected_check_ids: list[str] | None = None,
) -> tuple[list[FlagRow], list[dict[str, str]]]:
    """Run selected (or all) checks. Returns (flags, skipped_checks)."""
    if selected_check_ids is None:
        selected_check_ids = get_available_check_ids()

    all_flags: list[FlagRow] = []
    skipped: list[dict[str, str]] = []

    for check_id in selected_check_ids:
        check_module = _CHECK_BY_ID.get(check_id)
        if check_module is None:
            logger.warning("Unknown check ID '%s' — skipping", check_id)
            skipped.append({"check_id": check_id, "reason": "unknown check ID"})
            continue

        reason = _check_can_run(check_module, mapping)
        if reason is not None:
            logger.warning("%s skipped: %s", check_id, reason)
            skipped.append({"check_id": check_id, "reason": reason})
            continue

        try:
            # CHK-009 aggregates prior flags — inject them via config
            if check_id == "CHK-009":
                config = {**config, "_prior_flags_for_aggregation": [f.as_dict() for f in all_flags]}

            flags = check_module.run(df, mapping, config, run_id)
            all_flags.extend(flags)
            logger.info("%s produced %d flag(s)", check_id, len(flags))
        except Exception:
            logger.error("Check %s failed", check_id, exc_info=True)

    return all_flags, skipped
