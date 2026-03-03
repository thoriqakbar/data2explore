"""Tests for the summarize module."""

from __future__ import annotations

import numpy as np
import pandas as pd

from d2e_engine.summarize import DISCRETE_THRESHOLD, summarize_numeric


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


class TestDiscreteVsContinuous:
    """Distribution type branching based on cardinality."""

    def test_discrete_low_cardinality(self):
        """4 unique values → discrete distribution with value counts."""
        df = pd.DataFrame({"education": [1, 2, 3, 4, 1, 2, 3, 1, 2, 1]})
        row = summarize_numeric(df)[0]
        assert row["distribution_type"] == "discrete"
        assert row["histogram"] is None
        assert row["discrete_distribution"] is not None
        bars = row["discrete_distribution"]
        assert len(bars) == 4
        # Sorted by value
        assert [b["value"] for b in bars] == [1.0, 2.0, 3.0, 4.0]
        assert [b["label"] for b in bars] == ["1", "2", "3", "4"]
        assert [b["count"] for b in bars] == [4, 3, 2, 1]

    def test_continuous_high_cardinality(self):
        """More than 20 unique values → continuous histogram."""
        rng = np.random.default_rng(42)
        df = pd.DataFrame({"income": rng.normal(5000, 1000, size=200)})
        row = summarize_numeric(df)[0]
        assert row["distribution_type"] == "continuous"
        assert row["histogram"] is not None
        assert len(row["histogram"]) == 20
        assert row["discrete_distribution"] is None

    def test_boundary_exactly_20_is_discrete(self):
        """Exactly DISCRETE_THRESHOLD unique values → discrete."""
        df = pd.DataFrame({"x": list(range(DISCRETE_THRESHOLD))})
        row = summarize_numeric(df)[0]
        assert row["distribution_type"] == "discrete"
        assert row["discrete_distribution"] is not None
        assert len(row["discrete_distribution"]) == DISCRETE_THRESHOLD

    def test_boundary_21_is_continuous(self):
        """DISCRETE_THRESHOLD + 1 unique values → continuous."""
        df = pd.DataFrame({"x": list(range(DISCRETE_THRESHOLD + 1))})
        row = summarize_numeric(df)[0]
        assert row["distribution_type"] == "continuous"
        assert row["histogram"] is not None
        assert row["discrete_distribution"] is None

    def test_binary_variable(self):
        """Binary 0/1 → discrete with 2 bars."""
        df = pd.DataFrame({"working": [0, 1, 1, 0, 1, 0, 0, 1, 1, 1]})
        row = summarize_numeric(df)[0]
        assert row["distribution_type"] == "discrete"
        bars = row["discrete_distribution"]
        assert len(bars) == 2
        assert bars[0]["value"] == 0.0
        assert bars[0]["label"] == "0"
        assert bars[0]["count"] == 4
        assert bars[1]["value"] == 1.0
        assert bars[1]["label"] == "1"
        assert bars[1]["count"] == 6

    def test_empty_series_defaults(self):
        """Column with all NaN → no distribution data."""
        df = pd.DataFrame({"x": [float("nan")] * 5})
        row = summarize_numeric(df)[0]
        assert row["distribution_type"] == "continuous"
        assert row["histogram"] is None
        assert row["discrete_distribution"] is None
