"""Tests for CHK-004: Missingness by Enumerator check."""

from __future__ import annotations

import pandas as pd

from d2e_engine.checks.chk004_missingness_enumerator import run


def _make_enum_df(n_per_enum: int = 15) -> pd.DataFrame:
    """Build a df where E3 has high missingness in 'score' column."""
    rows = []
    for i in range(n_per_enum):
        rows.append({"enum_id": "E1", "score": 100 + i})
        rows.append({"enum_id": "E2", "score": 200 + i})
    # E3: many missing values in 'score'
    for i in range(n_per_enum):
        val = None if i < n_per_enum - 1 else 300  # only 1 non-null
        rows.append({"enum_id": "E3", "score": val})
    return pd.DataFrame(rows)


class TestCHK004MissingnessEnumerator:
    def test_uniform_no_flags(self, base_config, fixed_run_id):
        """All enumerators have similar missingness → 0 flags."""
        df = pd.DataFrame({
            "enum_id": ["E1"] * 15 + ["E2"] * 15,
            "score": [None, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
                       None, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35],
        })
        mapping = {"enumerator_id": "enum_id"}
        flags = run(df, mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_high_deviation_flags_warning(self, base_config, fixed_run_id):
        """E3 has ~93% missing vs ~0% baseline → should flag."""
        df = _make_enum_df(15)
        mapping = {"enumerator_id": "enum_id"}
        flags = run(df, mapping, base_config, fixed_run_id)
        e3_flags = [f for f in flags if f.enumerator_id == "E3"]
        assert len(e3_flags) > 0

    def test_critical_severity_at_4x(self, base_config, fixed_run_id):
        """Deviation > 4x baseline (2 * deviation_factor) → Critical.

        Use deviation_factor=1.0 so critical threshold = 2x baseline.
        E3 ~93% missing vs baseline ~31% → 3x → exceeds 2x → Critical.
        """
        df = _make_enum_df(15)
        mapping = {"enumerator_id": "enum_id"}
        base_config["missingness_enumerator_deviation"] = 1.0
        flags = run(df, mapping, base_config, fixed_run_id)
        e3_flags = [f for f in flags if f.enumerator_id == "E3"]
        critical = [f for f in e3_flags if f.severity == "Critical"]
        assert len(critical) > 0

    def test_min_rows_threshold(self, base_config, fixed_run_id):
        """Enumerators with fewer rows than min_rows are skipped."""
        df = pd.DataFrame({
            "enum_id": ["E1"] * 15 + ["E2"] * 3,
            "score": [1] * 15 + [None, None, None],
        })
        mapping = {"enumerator_id": "enum_id"}
        base_config["missingness_enumerator_min_rows"] = 10
        flags = run(df, mapping, base_config, fixed_run_id)
        e2_flags = [f for f in flags if f.enumerator_id == "E2"]
        assert len(e2_flags) == 0

    def test_low_baseline_column_skipped(self, base_config, fixed_run_id):
        """Column with <1% baseline missing → skipped entirely."""
        df = pd.DataFrame({
            "enum_id": ["E1"] * 15 + ["E2"] * 15,
            "score": list(range(30)),  # no missing at all
        })
        mapping = {"enumerator_id": "enum_id"}
        flags = run(df, mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_missing_column_returns_empty(self, base_config, fixed_run_id):
        df = pd.DataFrame({"other": [1, 2, 3]})
        mapping = {"enumerator_id": "missing_col"}
        flags = run(df, mapping, base_config, fixed_run_id)
        assert len(flags) == 0
