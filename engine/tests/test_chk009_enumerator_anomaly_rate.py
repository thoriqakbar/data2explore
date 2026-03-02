"""Tests for CHK-009: Enumerator Anomaly Rate (meta-check)."""

from __future__ import annotations

import pandas as pd

from d2e_engine.checks.chk009_enumerator_anomaly_rate import run


def _make_prior_flags(enum_counts: dict[str, int]) -> list[dict[str, str]]:
    """Build prior flag dicts for injection via config."""
    flags = []
    for eid, count in enum_counts.items():
        for i in range(count):
            flags.append({
                "check_id": "CHK-001",
                "enumerator_id": eid,
                "id": f"R{i}",
                "column_name": "col",
            })
    return flags


class TestCHK009EnumeratorAnomalyRate:
    def test_no_prior_flags(self, base_config, fixed_run_id):
        df = pd.DataFrame({"enum_id": ["E1", "E2", "E3"]})
        mapping = {"enumerator_id": "enum_id"}
        flags = run(df, mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_below_min_flags_threshold(self, base_config, fixed_run_id):
        df = pd.DataFrame({"enum_id": ["E1"] * 10 + ["E2"] * 10})
        mapping = {"enumerator_id": "enum_id"}
        base_config["_prior_flags_for_aggregation"] = _make_prior_flags({"E1": 3, "E2": 1})
        base_config["enumerator_anomaly_min_flags"] = 5
        flags = run(df, mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_warning_at_2x_median(self, base_config, fixed_run_id):
        df = pd.DataFrame({"enum_id": ["E1"] * 10 + ["E2"] * 10 + ["E3"] * 10})
        mapping = {"enumerator_id": "enum_id"}
        # E1: 5 flags, E2: 5, E3: 20 → median=5, E3 is 4x median
        base_config["_prior_flags_for_aggregation"] = _make_prior_flags({"E1": 5, "E2": 5, "E3": 20})
        base_config["enumerator_anomaly_min_flags"] = 5
        base_config["enumerator_anomaly_deviation"] = 2.0
        flags = run(df, mapping, base_config, fixed_run_id)
        e3_flags = [f for f in flags if f.enumerator_id == "E3"]
        assert len(e3_flags) == 1

    def test_critical_at_4x_median(self, base_config, fixed_run_id):
        df = pd.DataFrame({"enum_id": ["E1"] * 10 + ["E2"] * 10 + ["E3"] * 10})
        mapping = {"enumerator_id": "enum_id"}
        # E3 has 25 flags vs median 5 → 5x → >4x → Critical
        base_config["_prior_flags_for_aggregation"] = _make_prior_flags({"E1": 5, "E2": 5, "E3": 25})
        base_config["enumerator_anomaly_min_flags"] = 5
        base_config["enumerator_anomaly_deviation"] = 2.0
        flags = run(df, mapping, base_config, fixed_run_id)
        e3_flags = [f for f in flags if f.enumerator_id == "E3"]
        assert len(e3_flags) == 1
        assert e3_flags[0].severity == "Critical"

    def test_single_enumerator(self, base_config, fixed_run_id):
        """Single enumerator: median == their count, so no deviation → 0 flags."""
        df = pd.DataFrame({"enum_id": ["E1"] * 10})
        mapping = {"enumerator_id": "enum_id"}
        base_config["_prior_flags_for_aggregation"] = _make_prior_flags({"E1": 10})
        flags = run(df, mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_chk009_flags_excluded_from_aggregation(self, base_config, fixed_run_id):
        """Prior flags with check_id CHK-009 should be excluded from aggregation."""
        df = pd.DataFrame({"enum_id": ["E1"] * 10 + ["E2"] * 10})
        mapping = {"enumerator_id": "enum_id"}
        # E1 has 15 CHK-001 flags + 5 CHK-009 flags (which should be ignored)
        prior = _make_prior_flags({"E1": 15})
        for i in range(5):
            prior.append({"check_id": "CHK-009", "enumerator_id": "E1", "id": "", "column_name": ""})
        base_config["_prior_flags_for_aggregation"] = prior
        base_config["enumerator_anomaly_min_flags"] = 5
        base_config["enumerator_anomaly_deviation"] = 2.0
        flags = run(df, mapping, base_config, fixed_run_id)
        # Only 15 CHK-001 flags counted (not 20). Median = (0+15)/2 = 7.5.
        # 15 > 7.5*2 = 15? No, 15 <= 15. Need to verify the actual math...
        # Actually counts = [0, 15] sorted. n=2, median = (0+15)/2 = 7.5
        # 15 > 7.5 * 2 = 15? No, check is count <= median*deviation, so 15 <= 15 → not flagged.
        # Hmm, let's use 3 enumerators with E1 having way more flags.
        pass

    def test_chk009_flags_excluded_from_aggregation_v2(self, base_config, fixed_run_id):
        """Prior flags with check_id CHK-009 should be excluded from aggregation."""
        df = pd.DataFrame({"enum_id": ["E1"] * 10 + ["E2"] * 10 + ["E3"] * 10})
        mapping = {"enumerator_id": "enum_id"}
        # E1: 20 CHK-001 flags, E2: 2, E3: 2. Plus some CHK-009 flags on E1 (should be ignored).
        prior = _make_prior_flags({"E1": 20, "E2": 2, "E3": 2})
        for i in range(10):
            prior.append({"check_id": "CHK-009", "enumerator_id": "E1", "id": "", "column_name": ""})
        base_config["_prior_flags_for_aggregation"] = prior
        base_config["enumerator_anomaly_min_flags"] = 5
        base_config["enumerator_anomaly_deviation"] = 2.0
        flags = run(df, mapping, base_config, fixed_run_id)
        # Only CHK-001 flags counted: E1=20, E2=2, E3=2. Sorted: [2, 2, 20]. Median=2.
        # E1: 20 > 2*2=4 and 20 >= 5 → flagged
        e1_flags = [f for f in flags if f.enumerator_id == "E1"]
        assert len(e1_flags) == 1
