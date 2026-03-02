"""Tests for CHK-002: Missingness by Variable check."""

from __future__ import annotations

import pandas as pd

from d2e_engine.checks.chk002_missingness_variable import run


class TestCHK002MissingnessVariable:
    def test_no_missing(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"a": [1, 2, 3, 4, 5], "b": [1, 2, 3, 4, 5]})
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_warning_threshold(self, base_mapping, base_config, fixed_run_id):
        """25% missing triggers Warning (default threshold is 20%)."""
        df = pd.DataFrame({"a": [1, None, None, 4]})
        base_config["missing_warning_threshold"] = 0.20
        base_config["missing_critical_threshold"] = 0.50
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        assert flags[0].severity == "Warning"
        assert flags[0].check_id == "CHK-002"

    def test_critical_threshold(self, base_mapping, base_config, fixed_run_id):
        """55% missing triggers Critical (default threshold is 50%)."""
        df = pd.DataFrame({"a": [1, None, None, None, None, None, 7, 8, 9, None]})
        flags = run(df, base_mapping, base_config, fixed_run_id)
        # 6/10 = 60% > 50%
        assert len(flags) == 1
        assert flags[0].severity == "Critical"

    def test_excluded_column_skipped(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"secret": [None, None, None, None, 5]})
        base_config["excluded_columns"] = ["secret"]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_empty_df(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"a": pd.Series([], dtype="float64")})
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_below_threshold(self, base_mapping, base_config, fixed_run_id):
        """10% missing should not flag with default 20% warning threshold."""
        df = pd.DataFrame({"a": [1, 2, 3, 4, 5, 6, 7, 8, 9, None]})
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0
