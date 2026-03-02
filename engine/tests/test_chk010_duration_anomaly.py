"""Tests for CHK-010: Interview Duration Anomaly check (relative detection via median + MAD)."""

from __future__ import annotations

import pandas as pd

from d2e_engine.checks.chk010_duration_anomaly import run


def _make_df(durations: list[float]) -> pd.DataFrame:
    """Helper: build a DataFrame with resp_id + duration_minutes columns."""
    return pd.DataFrame({
        "resp_id": [f"R{i}" for i in range(len(durations))],
        "duration_minutes": durations,
    })


class TestCHK010DurationAnomaly:
    def test_normal_cluster_no_flags(self, base_mapping, base_config, fixed_run_id):
        """A tight cluster of similar durations produces no flags."""
        df = _make_df([25, 30, 28, 32, 27, 29, 31, 26])
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_impossible_duration(self, base_mapping, base_config, fixed_run_id):
        """Durations ≤0 are always flagged as Critical, regardless of statistics."""
        df = _make_df([0, -5, 25, 30, 28, 32, 27])
        flags = run(df, base_mapping, base_config, fixed_run_id)
        impossible = [f for f in flags if "impossible" in f.rule_reference]
        assert len(impossible) == 2
        for f in impossible:
            assert f.severity == "Critical"

    def test_relative_short_outlier(self, base_mapping, base_config, fixed_run_id):
        """A value far below the median is flagged as short."""
        # Cluster around 30 min, with one extreme outlier at 2 min
        df = _make_df([30, 29, 31, 30, 28, 32, 30, 2])
        flags = run(df, base_mapping, base_config, fixed_run_id)
        short = [f for f in flags if "short" in f.rule_reference]
        assert len(short) == 1
        assert "2.0" in short[0].observed_value

    def test_relative_long_outlier(self, base_mapping, base_config, fixed_run_id):
        """A value far above the median is flagged as long."""
        # Cluster around 30 min, with one extreme outlier at 200 min
        df = _make_df([30, 29, 31, 30, 28, 32, 30, 200])
        flags = run(df, base_mapping, base_config, fixed_run_id)
        long = [f for f in flags if "long" in f.rule_reference]
        assert len(long) == 1
        assert "200.0" in long[0].observed_value

    def test_heaped_duration(self, base_mapping, base_config, fixed_run_id):
        """Round-number durations within ceiling are flagged as heaped."""
        # 10 and 15 are multiples of 5, within ceiling of 15
        # Use a cluster so they're not relative outliers — heaping is the flag reason
        df = _make_df([10, 15, 12, 11, 13, 14, 12, 11])
        base_config["heaping_multiple"] = 5
        base_config["heaping_ceiling"] = 15
        flags = run(df, base_mapping, base_config, fixed_run_id)
        heaped = [f for f in flags if "heaped" in f.rule_reference]
        assert len(heaped) == 2

    def test_above_ceiling_not_heaped(self, base_mapping, base_config, fixed_run_id):
        """Duration=20 is multiple of 5 but above ceiling=15 → not heaped."""
        df = _make_df([20, 21, 19, 22, 18, 20, 21, 19])
        base_config["heaping_multiple"] = 5
        base_config["heaping_ceiling"] = 15
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_missing_column_returns_empty(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "other": [5]})
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_constant_durations_no_relative_flags(self, base_mapping, base_config, fixed_run_id):
        """When all durations are identical (MAD=0), relative detection is skipped."""
        df = _make_df([30, 30, 30, 30, 30, 30])
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_too_few_observations_skips_relative(self, base_mapping, base_config, fixed_run_id):
        """With fewer than min_observations, relative detection is skipped."""
        # Only 3 valid obs (below default min_observations=5), one of which is extreme
        df = _make_df([30, 30, 200])
        flags = run(df, base_mapping, base_config, fixed_run_id)
        # 200 would be a relative outlier in a larger dataset, but with <5 obs, no relative flag
        relative = [f for f in flags if f.rule_reference in ("duration_short", "duration_long")]
        assert len(relative) == 0

    def test_custom_deviation_factor(self, base_mapping, base_config, fixed_run_id):
        """A tighter deviation factor flags values that the default wouldn't."""
        # Cluster: [30]*7 + [40]. Median=30, MAD=0 for the 30s...
        # Better: spread them slightly so MAD > 0
        df = _make_df([28, 29, 30, 31, 30, 29, 30, 45])
        # With default factor=3.0, 45 might not be flagged. With factor=1.5, it should be.
        base_config["duration_deviation_factor"] = 1.5
        flags = run(df, base_mapping, base_config, fixed_run_id)
        long = [f for f in flags if "long" in f.rule_reference]
        assert len(long) >= 1

    def test_simple_df_fixture(self, simple_df, base_mapping, base_config, fixed_run_id):
        """simple_df row 9 has duration_minutes=-5 → impossible."""
        flags = run(simple_df, base_mapping, base_config, fixed_run_id)
        impossible = [f for f in flags if "impossible" in f.rule_reference]
        assert len(impossible) >= 1

    def test_start_end_mode(self, base_mapping, base_config, fixed_run_id):
        """start_end mode: compute duration from two datetime columns."""
        df = pd.DataFrame({
            "resp_id": [f"R{i}" for i in range(8)],
            "start_time": ["2025-01-01 10:00"] * 8,
            "end_time": [
                # 7 normal durations ~30 min, then 1 extreme outlier at 300 min
                "2025-01-01 10:28",
                "2025-01-01 10:30",
                "2025-01-01 10:32",
                "2025-01-01 10:29",
                "2025-01-01 10:31",
                "2025-01-01 10:30",
                "2025-01-01 10:30",
                "2025-01-01 15:00",  # 300 min → long outlier
            ],
        })
        base_config["duration_mode"] = "start_end"
        base_config["duration_start_column"] = "start_time"
        base_config["duration_end_column"] = "end_time"
        flags = run(df, base_mapping, base_config, fixed_run_id)
        long = [f for f in flags if "long" in f.rule_reference]
        assert len(long) == 1

    def test_seconds_unit(self, base_mapping, base_config, fixed_run_id):
        """Column mode with seconds unit converts to minutes before analysis."""
        # Cluster around 1800s (30 min), one outlier at 120s (2 min)
        df = pd.DataFrame({
            "resp_id": [f"R{i}" for i in range(8)],
            "dur_sec": [1800, 1740, 1860, 1800, 1770, 1830, 1800, 120],
        })
        base_config["duration_mode"] = "column"
        base_config["duration_column"] = "dur_sec"
        base_config["duration_unit"] = "seconds"
        flags = run(df, base_mapping, base_config, fixed_run_id)
        short = [f for f in flags if "short" in f.rule_reference]
        assert len(short) == 1

    def test_none_mode_skips(self, base_mapping, base_config, fixed_run_id):
        """mode='none' should skip the check entirely."""
        df = _make_df([-5, 30, 30, 30, 30])
        base_config["duration_mode"] = "none"
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_message_includes_median(self, base_mapping, base_config, fixed_run_id):
        """Relative flag messages include the median for context."""
        df = _make_df([30, 29, 31, 30, 28, 32, 30, 200])
        flags = run(df, base_mapping, base_config, fixed_run_id)
        long = [f for f in flags if "long" in f.rule_reference]
        assert len(long) == 1
        assert "median" in long[0].message.lower()
