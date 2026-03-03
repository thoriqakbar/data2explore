from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import pandas as pd


@dataclass
class FlagRow:
    run_id: str
    check_id: str
    check_name: str
    severity: str
    status: str = "Open"
    id: str = ""
    enumerator_id: str = ""
    survey_date: str = ""
    column_name: str = ""
    observed_value: str = ""
    rule_reference: str = ""
    message: str = ""
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    # Column order for CSV output
    FIELD_ORDER: tuple[str, ...] = (
        "run_id", "check_id", "check_name", "severity", "status",
        "id", "enumerator_id", "survey_date", "column_name",
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


def fmt_survey_date(val: object) -> str:
    """Best-effort format a date value as YYYY-MM-DD string."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    s = str(val).strip()
    if not s:
        return ""
    # Already YYYY-MM-DD or longer ISO string? Slice first 10 chars.
    if len(s) >= 10 and s[4:5] == "-" and s[7:8] == "-":
        return s[:10]
    # Try pandas parsing as fallback
    try:
        return pd.Timestamp(val).strftime("%Y-%m-%d")
    except Exception:
        return s
