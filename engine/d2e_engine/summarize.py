from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

REQUIRED_MAPPING_FIELDS = ("id", "enumerator_id", "survey_date")


def load_mapping(mapping_path: Path) -> dict[str, str]:
    with mapping_path.open("r", encoding="utf-8") as f:
        mapping = json.load(f)
    missing = [field for field in REQUIRED_MAPPING_FIELDS if field not in mapping]
    if missing:
        raise ValueError(f"Missing required mapping fields: {', '.join(missing)}")
    return mapping


def summarize_numeric(df: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    numeric_cols = df.select_dtypes(include=["number"]).columns
    for col in sorted(numeric_cols):
        series = df[col].dropna()
        rows.append(
            {
                "variable": str(col),
                "obs": int(series.shape[0]),
                "mean": float(series.mean()) if len(series) else None,
                "std_dev": float(series.std()) if len(series) > 1 else None,
                "min": float(series.min()) if len(series) else None,
                "max": float(series.max()) if len(series) else None,
            }
        )
    return rows


def build_summary(df: pd.DataFrame, mapping: dict[str, str]) -> dict[str, Any]:
    for logical, source_col in mapping.items():
        if source_col not in df.columns:
            raise ValueError(f"Mapped column for '{logical}' not found: {source_col}")

    return {
        "summary_stats": summarize_numeric(df),
        "mapping": mapping,
        "defaults": {"outlier_method": "zscore", "zscore_threshold": 3.0},
    }
