"""Edge case tests across all checks: empty data, single row, wide datasets, etc."""

from __future__ import annotations

import pandas as pd
import pytest

from d2e_engine.runner import run_checks


class TestEdgeCases:
    def test_empty_df(self, base_mapping, base_config, fixed_run_id):
        """0 rows should produce 0 flags and no errors."""
        df = pd.DataFrame({
            "resp_id": pd.Series([], dtype="str"),
            "enum_id": pd.Series([], dtype="str"),
            "date": pd.Series([], dtype="str"),
            "module": pd.Series([], dtype="str"),
            "duration_minutes": pd.Series([], dtype="float64"),
        })
        flags, skipped = run_checks(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_single_row(self, base_mapping, base_config, fixed_run_id):
        """Single row — no division by zero, no crashes."""
        df = pd.DataFrame({
            "resp_id": ["R1"],
            "enum_id": ["E1"],
            "date": ["2025-01-01"],
            "module": ["A"],
            "income": [500],
            "duration_minutes": [25],
        })
        flags, skipped = run_checks(df, base_mapping, base_config, fixed_run_id)
        assert isinstance(flags, list)

    def test_all_nan_column(self, base_mapping, base_config, fixed_run_id):
        """Column that is entirely NaN — checks should handle gracefully."""
        df = pd.DataFrame({
            "resp_id": ["R1", "R2", "R3"],
            "enum_id": ["E1", "E1", "E1"],
            "date": ["2025-01-01", "2025-01-02", "2025-01-03"],
            "module": ["A", "A", "A"],
            "all_null": [None, None, None],
        })
        flags, skipped = run_checks(df, base_mapping, base_config, fixed_run_id)
        assert isinstance(flags, list)

    def test_wide_dataset(self, base_mapping, base_config, fixed_run_id):
        """500+ columns — should not crash or timeout."""
        data = {
            "resp_id": [f"R{i}" for i in range(10)],
            "enum_id": ["E1"] * 10,
            "date": ["2025-01-01"] * 10,
            "module": ["A"] * 10,
        }
        for i in range(500):
            data[f"col_{i:04d}"] = list(range(10))
        df = pd.DataFrame(data)
        flags, skipped = run_checks(df, base_mapping, base_config, fixed_run_id)
        assert isinstance(flags, list)

    def test_special_chars_in_column_names(self, base_mapping, base_config, fixed_run_id):
        """Columns with spaces, dots, unicode should not crash."""
        df = pd.DataFrame({
            "resp_id": ["R1", "R2"],
            "enum_id": ["E1", "E1"],
            "date": ["2025-01-01", "2025-01-02"],
            "module": ["A", "A"],
            "income (USD)": [500, 600],
            "score.v2": [80, 90],
        })
        flags, skipped = run_checks(df, base_mapping, base_config, fixed_run_id)
        assert isinstance(flags, list)

    def test_mixed_types_in_column(self, base_mapping, base_config, fixed_run_id):
        """Column with mixed string and numeric values."""
        df = pd.DataFrame({
            "resp_id": ["R1", "R2", "R3"],
            "enum_id": ["E1", "E1", "E1"],
            "date": ["2025-01-01", "2025-01-02", "2025-01-03"],
            "module": ["A", "A", "A"],
            "mixed": [100, "text", None],
        })
        flags, skipped = run_checks(df, base_mapping, base_config, fixed_run_id)
        assert isinstance(flags, list)

    def test_all_identical_values(self, base_mapping, base_config, fixed_run_id):
        """Column with std=0 — outlier check must not divide by zero."""
        df = pd.DataFrame({
            "resp_id": [f"R{i}" for i in range(10)],
            "enum_id": ["E1"] * 10,
            "date": ["2025-01-01"] * 10,
            "module": ["A"] * 10,
            "score": [42] * 10,
        })
        flags, skipped = run_checks(df, base_mapping, base_config, fixed_run_id)
        outlier_flags = [f for f in flags if f.check_id == "CHK-008"]
        assert len(outlier_flags) == 0

    def test_single_enumerator(self, base_mapping, base_config, fixed_run_id):
        """Single enumerator — CHK-004 and CHK-009 should handle gracefully."""
        df = pd.DataFrame({
            "resp_id": [f"R{i}" for i in range(15)],
            "enum_id": ["E1"] * 15,
            "date": ["2025-01-01"] * 15,
            "module": ["A"] * 15,
            "score": list(range(15)),
        })
        flags, skipped = run_checks(df, base_mapping, base_config, fixed_run_id)
        assert isinstance(flags, list)
