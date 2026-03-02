"""Tests for CHK-012: Allowed Values check."""

from __future__ import annotations

import pandas as pd

from d2e_engine.checks.chk012_allowed_values import run


class TestCHK012AllowedValues:
    def test_no_rules_no_flags(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"gender": ["M", "F"]})
        base_config["allowed_values_rules"] = []
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_all_allowed(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1", "R2"], "gender": ["M", "F"]})
        base_config["allowed_values_rules"] = [{"column": "gender", "values": ["M", "F"]}]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_disallowed_value(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1", "R2", "R3"], "gender": ["M", "F", "X"]})
        base_config["allowed_values_rules"] = [{"column": "gender", "values": ["M", "F"]}]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        assert flags[0].severity == "Critical"
        assert flags[0].observed_value == "X"

    def test_nan_skipped(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1", "R2"], "gender": ["M", None]})
        base_config["allowed_values_rules"] = [{"column": "gender", "values": ["M", "F"]}]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_excluded_column(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "gender": ["X"]})
        base_config["allowed_values_rules"] = [{"column": "gender", "values": ["M", "F"]}]
        base_config["excluded_columns"] = ["gender"]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_string_coercion(self, base_mapping, base_config, fixed_run_id):
        """Numeric values should be coerced to string for comparison."""
        df = pd.DataFrame({"resp_id": ["R1", "R2"], "code": [1, 2]})
        base_config["allowed_values_rules"] = [{"column": "code", "values": ["1", "2"]}]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        # 1 becomes "1" which matches "1" in allowed set? Depends on float vs int
        # pandas int column: str(1) == "1" ✓
        assert len(flags) == 0

    def test_float_coercion_mismatch(self, base_mapping, base_config, fixed_run_id):
        """Float values like 1.0 become '1.0' not '1' — this is expected behavior."""
        df = pd.DataFrame({"resp_id": ["R1"], "code": [1.0]})
        base_config["allowed_values_rules"] = [{"column": "code", "values": ["1"]}]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        # str(1.0) == "1.0" != "1" → flag
        assert len(flags) == 1
