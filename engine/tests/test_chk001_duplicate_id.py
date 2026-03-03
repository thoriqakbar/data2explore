"""Tests for CHK-001: Duplicate ID check."""

from __future__ import annotations

import pandas as pd
import pytest

from d2e_engine.checks.chk001_duplicate_id import run


class TestCHK001DuplicateId:
    def test_no_duplicates(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1", "R2", "R3"], "enum_id": ["E1", "E1", "E2"]})
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_single_duplicate(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1", "R2", "R1"], "enum_id": ["E1", "E1", "E2"]})
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        assert flags[0].check_id == "CHK-001"
        assert flags[0].severity == "Critical"
        assert flags[0].observed_value == "R1"

    def test_multiple_duplicates(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1", "R2", "R1", "R2", "R3"]})
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 2
        ids = {f.observed_value for f in flags}
        assert ids == {"R1", "R2"}

    def test_nan_ids_ignored(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": [None, None, "R1"], "enum_id": ["E1", "E2", "E1"]})
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_missing_column_returns_empty(self, base_config, fixed_run_id):
        df = pd.DataFrame({"other_col": [1, 2, 3]})
        mapping = {"id": "resp_id"}
        flags = run(df, mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_enriches_enumerator(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R1", "R1"],
            "enum_id": ["E1", "E2"],
        })
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        assert flags[0].enumerator_id == "E1"

    def test_simple_df_fixture(self, simple_df, base_mapping, base_config, fixed_run_id):
        """simple_df has R001 duplicated at rows 0 and 8."""
        flags = run(simple_df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        assert flags[0].observed_value == "R001"

    def test_single_duplicate_has_survey_date(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R1", "R2", "R1"],
            "enum_id": ["E1", "E1", "E2"],
            "date": ["2025-01-10", "2025-01-11", "2025-01-12"],
        })
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        assert flags[0].survey_date == "2025-01-10"
