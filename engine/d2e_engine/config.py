from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DEFAULT_CONFIG: dict[str, Any] = {
    "zscore_threshold": 3.0,
    "missing_warning_threshold": 0.20,
    "missing_critical_threshold": 0.50,
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
