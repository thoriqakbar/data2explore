from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DEFAULT_CONFIG: dict[str, Any] = {
    "zscore_threshold": 3.0,
    "missing_warning_threshold": 0.20,
    "missing_critical_threshold": 0.50,
    "range_rules": [],
    "allowed_values_rules": [],
    "excluded_columns": [],
    # CHK-010 duration anomaly
    "duration_mode": "column",  # "column" | "start_end" | "none"
    "duration_column": "duration_minutes",
    "duration_unit": "minutes",  # "minutes" | "seconds"
    "duration_start_column": "",
    "duration_end_column": "",
    "min_duration_minutes": 5,
    "max_duration_minutes": 120,
    "heaping_multiple": 5,
    "heaping_ceiling": 15,
    # CHK-004 missingness by enumerator
    "missingness_enumerator_deviation": 2.0,
    "missingness_enumerator_min_rows": 10,
    # CHK-009 enumerator anomaly rate
    "enumerator_anomaly_deviation": 2.0,
    "enumerator_anomaly_min_flags": 5,
}


def load_config(path: str | Path | None) -> dict[str, Any]:
    """Load a JSON config file and shallow-merge over defaults.

    If *path* is None, returns a copy of DEFAULT_CONFIG.
    """
    config = dict(DEFAULT_CONFIG)
    if path is not None:
        with Path(path).open("r", encoding="utf-8") as f:
            overrides = json.load(f)
        config.update(overrides)
    return config
