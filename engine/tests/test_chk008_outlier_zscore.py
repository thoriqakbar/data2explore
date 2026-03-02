"""Tests for CHK-008: Outlier Z-score check."""

from __future__ import annotations

import pandas as pd

from d2e_engine.checks.chk008_outlier_zscore import run


class TestCHK008OutlierZscore:
    def test_no_outliers(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": [f"R{i}" for i in range(10)],
            "score": [50, 52, 48, 51, 49, 50, 53, 47, 50, 51],
        })
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_clear_outlier_flagged(self, base_mapping, base_config, fixed_run_id):
        # Need enough normal points so the outlier doesn't inflate std too much
        normal = [50 + i % 5 for i in range(50)]
        df = pd.DataFrame({
            "resp_id": [f"R{i}" for i in range(51)],
            "score": normal + [99999],
        })
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) >= 1
        assert flags[0].check_id == "CHK-008"
        assert flags[0].severity == "Warning"

    def test_custom_threshold(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": [f"R{i}" for i in range(20)],
            "score": [50] * 19 + [80],
        })
        # With very low threshold, the 80 should be flagged
        base_config["zscore_threshold"] = 1.0
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) >= 1

    def test_constant_column_skipped(self, base_mapping, base_config, fixed_run_id):
        """Column with std=0 should produce 0 flags (division by zero avoided)."""
        df = pd.DataFrame({
            "resp_id": [f"R{i}" for i in range(5)],
            "score": [42, 42, 42, 42, 42],
        })
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_excluded_column(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": [f"R{i}" for i in range(10)],
            "score": [50] * 9 + [99999],
        })
        base_config["excluded_columns"] = ["score"]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_simple_df_outlier(self, base_mapping, base_config, fixed_run_id):
        """Outlier detection with enough normal data points to prevent std inflation."""
        normal = [500 + i for i in range(50)]
        df = pd.DataFrame({
            "resp_id": [f"R{i}" for i in range(51)],
            "enum_id": ["E1"] * 51,
            "income": normal + [99999],
        })
        flags = run(df, base_mapping, base_config, fixed_run_id)
        income_flags = [f for f in flags if f.column_name == "income"]
        assert len(income_flags) >= 1
