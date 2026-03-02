from __future__ import annotations

from typing import Any

import pandas as pd


def profile_dataframe(df: pd.DataFrame) -> dict[str, Any]:
    columns = []
    for col in df.columns:
        series = df[col]
        # First 5 unique non-null values, truncated to 50 chars
        non_null = series.dropna()
        unique_vals = non_null.unique()[:5]
        sample_values = [str(v)[:50] for v in unique_vals]

        columns.append(
            {
                "name": str(col),
                "dtype": str(series.dtype),
                "missing_count": int(series.isna().sum()),
                "non_missing_count": int(series.notna().sum()),
                "sample_values": sample_values,
            }
        )

    return {
        "row_count": int(len(df)),
        "column_count": int(df.shape[1]),
        "columns": columns,
    }
