"""Shared fixtures for all d2e_engine tests."""

from __future__ import annotations

import pytest
import pandas as pd

from d2e_engine.config import DEFAULT_CONFIG


@pytest.fixture()
def base_mapping() -> dict[str, str]:
    """Canonical mapping pointing to column names in simple_df."""
    return {
        "id": "resp_id",
        "enumerator_id": "enum_id",
        "survey_date": "date",
        "module": "module",
    }


@pytest.fixture()
def base_config() -> dict[str, object]:
    """Copy of DEFAULT_CONFIG — tests can override individual keys."""
    return dict(DEFAULT_CONFIG)


@pytest.fixture()
def fixed_run_id() -> str:
    return "test-run-00000000-0000-0000-0000-000000000000"


@pytest.fixture()
def simple_df() -> pd.DataFrame:
    """10-row DataFrame with known values that trigger each check type.

    Rows 0-7: normal data from 3 enumerators (E1, E2, E3).
    Row 8: duplicate of resp_id "R001" (triggers CHK-001).
    Row 9: extreme outlier in 'income', impossible duration, high missingness enumerator.
    """
    return pd.DataFrame(
        {
            "resp_id": ["R001", "R002", "R003", "R004", "R005", "R006", "R007", "R008", "R001", "R010"],
            "enum_id": ["E1", "E1", "E1", "E2", "E2", "E2", "E3", "E3", "E1", "E3"],
            "date": [
                "2025-01-01", "2025-01-01", "2025-01-02", "2025-01-02",
                "2025-01-03", "2025-01-03", "2025-01-04", "2025-01-04",
                "2025-01-05", "2025-01-05",
            ],
            "module": ["A", "A", "B", "A", "B", "A", "A", "B", "A", "A"],
            "income": [500, 520, 480, 510, 490, 530, 500, 510, 500, 99999],
            "age": [30, 35, 28, 40, 32, None, 29, 31, 30, 25],
            "gender": ["M", "F", "M", "F", "M", "F", "M", "F", "M", "X"],
            "duration_minutes": [25, 30, 20, 35, 15, 45, 10, 60, 25, -5],
        }
    )
