from __future__ import annotations

from typing import Any

import pandas as pd


def profile_dataframe(df: pd.DataFrame) -> dict[str, Any]:
    columns = []
    for col in df.columns:
        series = df[col]
        columns.append(
            {
                "name": str(col),
                "dtype": str(series.dtype),
                "missing_count": int(series.isna().sum()),
                "non_missing_count": int(series.notna().sum()),
            }
        )

    return {
        "row_count": int(len(df)),
        "column_count": int(df.shape[1]),
        "columns": columns,
    }
