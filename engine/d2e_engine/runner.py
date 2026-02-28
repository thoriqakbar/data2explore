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


def run_all_checks(
    df: pd.DataFrame,
    mapping: dict[str, str],
    config: dict[str, Any],
    run_id: str,
) -> list[FlagRow]:
    """Run all registered checks and return combined flags."""
    all_flags: list[FlagRow] = []
    for check_module in _CHECKS:
        name = getattr(check_module, "CHECK_ID", check_module.__name__)
        try:
            flags = check_module.run(df, mapping, config, run_id)
            all_flags.extend(flags)
            logger.info("%s produced %d flag(s)", name, len(flags))
        except Exception:
            logger.error("Check %s failed", name, exc_info=True)
    return all_flags
