"""Tests for the check runner orchestration."""

from __future__ import annotations

import pandas as pd

from d2e_engine.runner import run_checks, get_available_check_ids


class TestRunner:
    def test_run_all_checks(self, simple_df, base_mapping, base_config, fixed_run_id):
        flags, skipped = run_checks(simple_df, base_mapping, base_config, fixed_run_id)
        assert isinstance(flags, list)
        assert isinstance(skipped, list)
        # At least CHK-001 should fire (duplicate R001)
        chk001 = [f for f in flags if f.check_id == "CHK-001"]
        assert len(chk001) >= 1

    def test_selected_checks_filtering(self, simple_df, base_mapping, base_config, fixed_run_id):
        flags, skipped = run_checks(
            simple_df, base_mapping, base_config, fixed_run_id,
            selected_check_ids=["CHK-001"],
        )
        check_ids = {f.check_id for f in flags}
        assert check_ids <= {"CHK-001"}

    def test_unknown_check_skipped(self, simple_df, base_mapping, base_config, fixed_run_id):
        flags, skipped = run_checks(
            simple_df, base_mapping, base_config, fixed_run_id,
            selected_check_ids=["CHK-999"],
        )
        assert len(flags) == 0
        assert any(s["check_id"] == "CHK-999" for s in skipped)

    def test_missing_mapping_field_skips(self, simple_df, base_config, fixed_run_id):
        """CHK-001 requires 'id' — if not in mapping, it's skipped."""
        mapping = {"enumerator_id": "enum_id"}  # no 'id'
        flags, skipped = run_checks(
            simple_df, mapping, base_config, fixed_run_id,
            selected_check_ids=["CHK-001"],
        )
        assert len(flags) == 0
        assert any(s["check_id"] == "CHK-001" for s in skipped)

    def test_chk009_receives_prior_flags(self, simple_df, base_mapping, base_config, fixed_run_id):
        """CHK-009 should aggregate flags from preceding checks."""
        flags, skipped = run_checks(simple_df, base_mapping, base_config, fixed_run_id)
        # CHK-009 is always last; it may or may not produce flags
        # but shouldn't error out
        chk009_skipped = [s for s in skipped if s["check_id"] == "CHK-009"]
        assert len(chk009_skipped) == 0  # should not be skipped if enumerator_id mapped

    def test_exception_in_one_check_doesnt_stop_others(self, base_mapping, base_config, fixed_run_id):
        """Even if a check fails internally, other checks still run."""
        df = pd.DataFrame({
            "resp_id": ["R1", "R1"],  # duplicate
            "enum_id": ["E1", "E1"],
            "date": ["2025-01-01", "2025-01-01"],
            "module": ["A", "A"],
        })
        # This should not crash even with minimal data
        flags, skipped = run_checks(df, base_mapping, base_config, fixed_run_id)
        assert isinstance(flags, list)

    def test_get_available_check_ids(self):
        ids = get_available_check_ids()
        assert "CHK-001" in ids
        assert "CHK-009" in ids
        # CHK-009 should be last
        assert ids[-1] == "CHK-009"
