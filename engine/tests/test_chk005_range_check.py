"""Tests for CHK-005: Range Check."""

from __future__ import annotations

import pandas as pd

from d2e_engine.checks.chk005_range_check import run


class TestCHK005RangeCheck:
    def test_no_rules_no_flags(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"age": [25, 30, 35]})
        base_config["range_rules"] = []
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_min_violation(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1", "R2"], "age": [10, 20]})
        base_config["range_rules"] = [{"column": "age", "min": 18}]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        assert flags[0].severity == "Critical"
        assert "10" in flags[0].observed_value

    def test_max_violation(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1", "R2"], "age": [50, 200]})
        base_config["range_rules"] = [{"column": "age", "max": 100}]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        assert "200" in flags[0].observed_value

    def test_nan_skipped(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1", "R2"], "age": [None, 25]})
        base_config["range_rules"] = [{"column": "age", "min": 0, "max": 120}]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_excluded_column(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "age": [200]})
        base_config["range_rules"] = [{"column": "age", "min": 0, "max": 100}]
        base_config["excluded_columns"] = ["age"]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_non_numeric_skipped(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "age": ["not_a_number"]})
        base_config["range_rules"] = [{"column": "age", "min": 0, "max": 100}]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_missing_column_no_error(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "other": [5]})
        base_config["range_rules"] = [{"column": "age", "min": 0, "max": 100}]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0
