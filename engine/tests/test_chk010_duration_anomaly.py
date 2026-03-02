"""Tests for CHK-010: Interview Duration Anomaly check."""

from __future__ import annotations

import pandas as pd

from d2e_engine.checks.chk010_duration_anomaly import run


class TestCHK010DurationAnomaly:
    def test_normal_durations(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R1", "R2", "R3"],
            "duration_minutes": [25, 30, 45],
        })
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_impossible_duration(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R1", "R2"],
            "duration_minutes": [0, -5],
        })
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 2
        for f in flags:
            assert f.severity == "Critical"
            assert "impossible" in f.rule_reference

    def test_short_duration(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R1"],
            "duration_minutes": [3],
        })
        base_config["min_duration_minutes"] = 5
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        assert flags[0].severity == "Warning"
        assert "short" in flags[0].rule_reference.lower() or "short" in flags[0].message.lower()

    def test_long_duration(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R1"],
            "duration_minutes": [200],
        })
        base_config["max_duration_minutes"] = 120
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        assert "long" in flags[0].rule_reference.lower() or "long" in flags[0].message.lower()

    def test_heaped_duration(self, base_mapping, base_config, fixed_run_id):
        """Duration that is a multiple of heaping_multiple and ≤ ceiling."""
        df = pd.DataFrame({
            "resp_id": ["R1", "R2"],
            "duration_minutes": [10, 15],
        })
        base_config["heaping_multiple"] = 5
        base_config["heaping_ceiling"] = 15
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 2
        for f in flags:
            assert "heaped" in f.rule_reference

    def test_above_ceiling_not_heaped(self, base_mapping, base_config, fixed_run_id):
        """Duration=20 is multiple of 5 but above ceiling=15 → not heaped."""
        df = pd.DataFrame({
            "resp_id": ["R1"],
            "duration_minutes": [20],
        })
        base_config["heaping_multiple"] = 5
        base_config["heaping_ceiling"] = 15
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_missing_column_returns_empty(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "other": [5]})
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_custom_thresholds(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R1"],
            "duration_minutes": [8],
        })
        base_config["min_duration_minutes"] = 10
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        assert "short" in flags[0].rule_reference

    def test_simple_df_fixture(self, simple_df, base_mapping, base_config, fixed_run_id):
        """simple_df row 9 has duration_minutes=-5 → impossible."""
        flags = run(simple_df, base_mapping, base_config, fixed_run_id)
        impossible = [f for f in flags if "impossible" in f.rule_reference]
        assert len(impossible) >= 1

    def test_start_end_mode(self, base_mapping, base_config, fixed_run_id):
        """start_end mode: compute duration from two datetime columns."""
        df = pd.DataFrame({
            "resp_id": ["R1", "R2", "R3"],
            "start_time": ["2025-01-01 10:00", "2025-01-01 10:00", "2025-01-01 10:00"],
            "end_time": ["2025-01-01 10:03", "2025-01-01 10:30", "2025-01-01 12:30"],
        })
        base_config["duration_mode"] = "start_end"
        base_config["duration_start_column"] = "start_time"
        base_config["duration_end_column"] = "end_time"
        base_config["min_duration_minutes"] = 5
        base_config["max_duration_minutes"] = 120
        flags = run(df, base_mapping, base_config, fixed_run_id)
        # R1: 3 min → short, R2: 30 min → ok, R3: 150 min → long
        assert len(flags) == 2
        subtypes = {f.rule_reference for f in flags}
        assert "duration_short" in subtypes
        assert "duration_long" in subtypes

    def test_seconds_unit(self, base_mapping, base_config, fixed_run_id):
        """Column mode with seconds unit: 180s = 3 min → short."""
        df = pd.DataFrame({
            "resp_id": ["R1"],
            "dur_sec": [180],  # 3 minutes
        })
        base_config["duration_mode"] = "column"
        base_config["duration_column"] = "dur_sec"
        base_config["duration_unit"] = "seconds"
        base_config["min_duration_minutes"] = 5
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        assert "short" in flags[0].rule_reference

    def test_none_mode_skips(self, base_mapping, base_config, fixed_run_id):
        """mode='none' should skip the check entirely."""
        df = pd.DataFrame({
            "resp_id": ["R1"],
            "duration_minutes": [-5],
        })
        base_config["duration_mode"] = "none"
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0
