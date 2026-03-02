"""Tests for the profile module."""

from __future__ import annotations

import pandas as pd

from d2e_engine.profile import profile_dataframe


class TestProfile:
    def test_basic_profile(self):
        df = pd.DataFrame({
            "name": ["Alice", "Bob", None],
            "age": [30, None, 25],
            "score": [90.5, 85.0, 92.0],
        })
        result = profile_dataframe(df)
        assert result["row_count"] == 3
        assert result["column_count"] == 3
        cols = {c["name"]: c for c in result["columns"]}
        assert cols["name"]["missing_count"] == 1
        assert cols["name"]["non_missing_count"] == 2
        assert cols["age"]["missing_count"] == 1
        assert cols["score"]["missing_count"] == 0
        assert "int" in cols["age"]["dtype"] or "float" in cols["age"]["dtype"]

    def test_empty_df(self):
        df = pd.DataFrame({"a": pd.Series([], dtype="float64")})
        result = profile_dataframe(df)
        assert result["row_count"] == 0
        assert result["column_count"] == 1
        assert result["columns"][0]["missing_count"] == 0
