from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

REQUIRED_MAPPING_FIELDS = ("id", "enumerator_id", "survey_date")


def load_mapping(mapping_path: Path) -> dict[str, str]:
    with mapping_path.open("r", encoding="utf-8") as f:
        mapping = json.load(f)
    missing = [field for field in REQUIRED_MAPPING_FIELDS if field not in mapping]
    if missing:
        raise ValueError(f"Missing required mapping fields: {', '.join(missing)}")
    return mapping


def load_mapping_lenient(mapping_path: Path) -> dict[str, str]:
    """Load mapping JSON without requiring all fields. For use by the check command."""
    with mapping_path.open("r", encoding="utf-8") as f:
        return json.load(f)


DISCRETE_THRESHOLD = 20


def summarize_numeric(
    df: pd.DataFrame,
    excluded_columns: set[str] | None = None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    numeric_cols = df.select_dtypes(include=["number"]).columns
    for col in sorted(numeric_cols):
        if excluded_columns and col in excluded_columns:
            continue
        series = df[col].dropna()

        histogram: list[dict[str, Any]] | None = None
        discrete_distribution: list[dict[str, Any]] | None = None
        distribution_type: str = "continuous"

        if len(series):
            percentiles_dict: dict[str, float] | None = {
                f"p{int(q * 100)}": float(series.quantile(q))
                for q in [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]
            }
            n_unique = int(series.nunique())
            if n_unique <= DISCRETE_THRESHOLD:
                vc = series.value_counts().sort_index()
                discrete_distribution = [
                    {
                        "value": float(v),
                        "label": str(int(v)) if float(v) == int(v) else f"{v:.1f}",
                        "count": int(c),
                    }
                    for v, c in vc.items()
                ]
                distribution_type = "discrete"
            else:
                counts, bin_edges = np.histogram(series.values, bins=20)
                histogram = [
                    {"bin_start": float(bin_edges[i]), "bin_end": float(bin_edges[i + 1]), "count": int(counts[i])}
                    for i in range(len(counts))
                ]
                distribution_type = "continuous"
        else:
            percentiles_dict = None

        rows.append(
            {
                "variable": str(col),
                "obs": int(series.shape[0]),
                "mean": float(series.mean()) if len(series) else None,
                "std_dev": float(series.std()) if len(series) > 1 else None,
                "min": float(series.min()) if len(series) else None,
                "max": float(series.max()) if len(series) else None,
                "percentiles": percentiles_dict,
                "histogram": histogram,
                "distribution_type": distribution_type,
                "discrete_distribution": discrete_distribution,
            }
        )
    return rows


def build_summary(
    df: pd.DataFrame,
    mapping: dict[str, str],
    excluded_columns: set[str] | None = None,
) -> dict[str, Any]:
    for logical, source_col in mapping.items():
        if source_col not in df.columns:
            raise ValueError(f"Mapped column for '{logical}' not found: {source_col}")

    return {
        "summary_stats": summarize_numeric(df, excluded_columns),
        "mapping": mapping,
        "defaults": {"outlier_method": "zscore", "zscore_threshold": 3.0},
    }
