from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class FlagRow:
    run_id: str
    check_id: str
    check_name: str
    severity: str
    status: str = "Open"
    id: str = ""
    enumerator_id: str = ""
    module: str = ""
    column_name: str = ""
    observed_value: str = ""
    rule_reference: str = ""
    message: str = ""
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    # Column order for CSV output
    FIELD_ORDER: tuple[str, ...] = (
        "run_id", "check_id", "check_name", "severity", "status",
        "id", "enumerator_id", "module", "column_name",
        "observed_value", "rule_reference", "message", "created_at",
    )

    def as_dict(self) -> dict[str, str]:
        return {k: getattr(self, k) for k in self.FIELD_ORDER}


def build_flag_row(**kwargs: Any) -> FlagRow:
    """Build a FlagRow, converting all values to str."""
    cleaned: dict[str, Any] = {}
    for key, value in kwargs.items():
        if key in ("status", "created_at"):
            # Preserve defaults — only override if explicitly set
            cleaned[key] = str(value)
        elif key in FlagRow.FIELD_ORDER:
            cleaned[key] = str(value) if value is not None else ""
    return FlagRow(**cleaned)
