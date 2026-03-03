"""Tests for survey_date field population across checks."""

from __future__ import annotations

import pandas as pd

from d2e_engine.checks.base import fmt_survey_date


class TestFmtSurveyDate:
    def test_yyyy_mm_dd_string(self):
        assert fmt_survey_date("2025-01-15") == "2025-01-15"

    def test_datetime_with_time(self):
        assert fmt_survey_date("2025-01-15T10:30:00") == "2025-01-15"

    def test_pandas_timestamp(self):
        assert fmt_survey_date(pd.Timestamp("2025-03-01")) == "2025-03-01"

    def test_none(self):
        assert fmt_survey_date(None) == ""

    def test_nan(self):
        assert fmt_survey_date(float("nan")) == ""

    def test_empty_string(self):
        assert fmt_survey_date("") == ""

    def test_unparseable_passthrough(self):
        # If pandas can't parse it either, return as-is
        result = fmt_survey_date("not-a-date")
        assert isinstance(result, str)


class TestRowLevelChecksPopulateSurveyDate:
    """Verify that row-level checks include survey_date from the mapped column."""

    def test_chk001_duplicate_id(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R1", "R2", "R1"],
            "enum_id": ["E1", "E1", "E2"],
            "date": ["2025-02-10", "2025-02-11", "2025-02-12"],
        })
        from d2e_engine.checks.chk001_duplicate_id import run
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        assert flags[0].survey_date == "2025-02-10"  # first_row date

    def test_chk005_range_check(self, base_mapping, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R1", "R2"],
            "enum_id": ["E1", "E1"],
            "date": ["2025-02-10", "2025-02-11"],
            "age": [200, 25],
        })
        config = {"range_rules": [{"column": "age", "min": 0, "max": 120}]}
        from d2e_engine.checks.chk005_range_check import run
        flags = run(df, base_mapping, config, fixed_run_id)
        assert len(flags) == 1
        assert flags[0].survey_date == "2025-02-10"

    def test_chk008_outlier(self, base_mapping, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": [f"R{i}" for i in range(20)],
            "enum_id": ["E1"] * 20,
            "date": ["2025-03-01"] * 19 + ["2025-03-02"],
            "income": [100] * 19 + [99999],
        })
        config = {"zscore_threshold": 3.0}
        from d2e_engine.checks.chk008_outlier_zscore import run
        flags = run(df, base_mapping, config, fixed_run_id)
        assert len(flags) >= 1
        # The outlier is the last row
        outlier_flag = [f for f in flags if f.id == "R19"][0]
        assert outlier_flag.survey_date == "2025-03-02"

    def test_chk012_allowed_values(self, base_mapping, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R1", "R2"],
            "enum_id": ["E1", "E1"],
            "date": ["2025-04-01", "2025-04-02"],
            "gender": ["M", "X"],
        })
        config = {"allowed_values_rules": [{"column": "gender", "values": ["M", "F"]}]}
        from d2e_engine.checks.chk012_allowed_values import run
        flags = run(df, base_mapping, config, fixed_run_id)
        assert len(flags) == 1
        assert flags[0].survey_date == "2025-04-02"

    def test_no_date_mapping_leaves_empty(self, fixed_run_id):
        """When mapping has no survey_date, flags should have empty survey_date."""
        df = pd.DataFrame({
            "resp_id": ["R1", "R2", "R1"],
            "enum_id": ["E1", "E1", "E2"],
        })
        mapping = {"id": "resp_id", "enumerator_id": "enum_id"}
        from d2e_engine.checks.chk001_duplicate_id import run
        flags = run(df, mapping, {}, fixed_run_id)
        assert len(flags) == 1
        assert flags[0].survey_date == ""


class TestAggregateLevelChecksEmptySurveyDate:
    """Verify that aggregate/column-level checks leave survey_date empty."""

    def test_chk002_missingness_variable(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R1", "R2", "R3"],
            "enum_id": ["E1", "E1", "E1"],
            "date": ["2025-01-01", "2025-01-02", "2025-01-03"],
            "col_a": [None, None, None],
        })
        config = {**base_config, "missing_warning_threshold": 0.2, "missing_critical_threshold": 0.5}
        from d2e_engine.checks.chk002_missingness_variable import run
        flags = run(df, base_mapping, config, fixed_run_id)
        assert len(flags) >= 1
        assert all(f.survey_date == "" for f in flags)
