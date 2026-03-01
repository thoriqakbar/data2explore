from __future__ import annotations

import csv
import json
import logging
from collections import Counter
from pathlib import Path
from typing import Any

from d2e_engine.checks.base import FlagRow

logger = logging.getLogger(__name__)


def flags_to_csv(flags: list[FlagRow], out_path: str | Path) -> None:
    """Write flags to CSV with 13-column header. Always writes header."""
    path = Path(out_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(FlagRow.FIELD_ORDER))
        writer.writeheader()
        for flag in flags:
            writer.writerow(flag.as_dict())


def load_prior_flags(path: str | Path | None) -> list[FlagRow]:
    """Parse a prior flags.csv for delta comparison. Returns [] on error."""
    if path is None:
        return []
    try:
        p = Path(path)
        if not p.exists():
            return []
        with p.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            return [FlagRow(**row) for row in reader]
    except Exception:
        logger.warning("Could not load prior flags from %s", path, exc_info=True)
        return []


def _flag_key(flag: FlagRow) -> tuple[str, str, str]:
    return (flag.id, flag.check_id, flag.column_name)


def build_summary_json(
    flags: list[FlagRow],
    run_id: str,
    prior_flags: list[FlagRow] | None = None,
) -> dict[str, Any]:
    """Aggregate counts by severity/check/enumerator, compute deltas."""
    by_severity: Counter[str] = Counter()
    by_check: Counter[str] = Counter()
    by_enumerator: Counter[str] = Counter()

    for flag in flags:
        by_severity[flag.severity] += 1
        by_check[flag.check_id] += 1
        if flag.enumerator_id:
            by_enumerator[flag.enumerator_id] += 1

    summary: dict[str, Any] = {
        "run_id": run_id,
        "total_flags": len(flags),
        "by_severity": dict(by_severity),
        "by_check": dict(by_check),
        "by_enumerator": dict(by_enumerator),
    }

    if prior_flags is not None:
        current_keys = {_flag_key(f) for f in flags}
        prior_keys = {_flag_key(f) for f in prior_flags}

        summary["has_prior_run"] = True
        summary["new_flags_count"] = len(current_keys - prior_keys)
        summary["resolved_flags_count"] = len(prior_keys - current_keys)
        summary["persisting_flags_count"] = len(current_keys & prior_keys)
    else:
        summary["has_prior_run"] = False
        summary["new_flags_count"] = len(flags)
        summary["resolved_flags_count"] = 0
        summary["persisting_flags_count"] = 0

    return summary


def flags_to_json(flags: list[FlagRow], out_path: str | Path) -> None:
    """Write flags as a JSON array (one dict per flag)."""
    path = Path(out_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump([flag.as_dict() for flag in flags], f, indent=2)


def summary_to_json(summary: dict[str, Any], out_path: str | Path) -> None:
    """Write summary dict to JSON."""
    path = Path(out_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
