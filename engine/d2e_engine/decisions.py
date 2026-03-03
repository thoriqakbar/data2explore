"""Flag decisions: load, save, apply suppression.

Decisions track which flags have been reviewed and dismissed by the user.
They persist across engine runs, enabling a cumulative review workflow.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from d2e_engine.checks.base import FlagRow

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1


@dataclass
class Decision:
    status: str = "dismissed"
    reason: str = ""
    note: str = ""
    observed_value_at_decision: str = ""
    decided_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    decided_by: str = "app"


def flag_key_str(flag: FlagRow) -> str:
    """Build a pipe-delimited decision key from a flag."""
    return f"{flag.id}|{flag.check_id}|{flag.column_name}|{flag.enumerator_id}|{flag.survey_date}"


def flag_key_from_dict(flag: dict[str, str]) -> str:
    """Build a pipe-delimited decision key from a flag dict."""
    return (
        f"{flag.get('id', '')}|{flag.get('check_id', '')}|{flag.get('column_name', '')}"
        f"|{flag.get('enumerator_id', '')}|{flag.get('survey_date', '')}"
    )


def load_decisions(path: str | Path | None) -> dict[str, Decision]:
    """Load decisions from a JSON file. Returns {} on missing/invalid file."""
    if path is None:
        return {}
    p = Path(path)
    if not p.exists():
        return {}
    try:
        with p.open("r", encoding="utf-8") as f:
            raw = json.load(f)
        if not isinstance(raw, dict):
            return {}
        decisions: dict[str, Decision] = {}
        for key, entry in raw.get("decisions", {}).items():
            if isinstance(entry, dict):
                decisions[key] = Decision(
                    status=entry.get("status", "dismissed"),
                    reason=entry.get("reason", ""),
                    note=entry.get("note", ""),
                    observed_value_at_decision=entry.get("observed_value_at_decision", ""),
                    decided_at=entry.get("decided_at", ""),
                    decided_by=entry.get("decided_by", ""),
                )
        return decisions
    except Exception:
        logger.warning("Could not load decisions from %s", path, exc_info=True)
        return {}


def save_decisions(
    decisions: dict[str, Decision],
    dataset_hash: str,
    path: str | Path,
) -> None:
    """Write decisions to a JSON file."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    payload: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "dataset_hash": dataset_hash,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "decisions": {key: asdict(dec) for key, dec in decisions.items()},
    }
    with p.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def flags_to_suppressed_json(flags: list[FlagRow], path: str | Path) -> None:
    """Write suppressed flags to a JSON file for audit trail."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("w", encoding="utf-8") as f:
        json.dump([flag.as_dict() for flag in flags], f, indent=2)


def apply_decisions(
    flags: list[FlagRow],
    decisions: dict[str, Decision],
) -> tuple[list[FlagRow], list[FlagRow]]:
    """Partition flags into (active, suppressed) based on decisions.

    A flag is suppressed if its key exists in decisions with status="dismissed".
    """
    if not decisions:
        return flags, []

    active: list[FlagRow] = []
    suppressed: list[FlagRow] = []

    for flag in flags:
        key = flag_key_str(flag)
        decision = decisions.get(key)
        if decision and decision.status == "dismissed":
            suppressed.append(flag)
        else:
            active.append(flag)

    return active, suppressed
