from __future__ import annotations

import logging
from types import ModuleType
from typing import Any

import pandas as pd

from d2e_engine.checks.base import FlagRow
from d2e_engine.checks import chk001_duplicate_id, chk002_missingness_variable, chk008_outlier_zscore

logger = logging.getLogger(__name__)

_CHECKS: list[ModuleType] = [
    chk001_duplicate_id,
    chk002_missingness_variable,
    chk008_outlier_zscore,
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
            flags = check_module.run(df, mapping, config, run_id)
            all_flags.extend(flags)
            logger.info("%s produced %d flag(s)", check_id, len(flags))
        except Exception:
            logger.error("Check %s failed", check_id, exc_info=True)

    return all_flags, skipped
