"""Tests for the summarize module."""

from __future__ import annotations

import pandas as pd

from d2e_engine.summarize import summarize_numeric


class TestSummarizeNumeric:
    def test_numeric_stats(self):
        df = pd.DataFrame({
            "income": [100, 200, 300, 400, 500],
            "name": ["a", "b", "c", "d", "e"],
        })
        rows = summarize_numeric(df)
        assert len(rows) == 1
        row = rows[0]
        assert row["variable"] == "income"
        assert row["obs"] == 5
        assert row["mean"] == 300.0
        assert row["min"] == 100.0
        assert row["max"] == 500.0
        assert row["std_dev"] is not None
        assert row["percentiles"] is not None
        assert "p50" in row["percentiles"]

    def test_excluded_columns_omitted(self):
        df = pd.DataFrame({"a": [1, 2, 3], "b": [4, 5, 6]})
        rows = summarize_numeric(df, excluded_columns={"b"})
        variables = [r["variable"] for r in rows]
        assert "a" in variables
        assert "b" not in variables

    def test_no_numeric_columns(self):
        df = pd.DataFrame({"name": ["a", "b", "c"], "city": ["x", "y", "z"]})
        rows = summarize_numeric(df)
        assert len(rows) == 0

    def test_single_value_no_std(self):
        df = pd.DataFrame({"a": [42]})
        rows = summarize_numeric(df)
        assert len(rows) == 1
        assert rows[0]["std_dev"] is None
