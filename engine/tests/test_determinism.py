"""Tests for check output determinism: same data + config → identical flags."""

from __future__ import annotations

import uuid

import pandas as pd

from d2e_engine.runner import run_checks


def _normalize_flags(flags):
    """Strip run_id and created_at for determinism comparison."""
    return sorted(
        [
            {k: v for k, v in f.as_dict().items() if k not in ("run_id", "created_at")}
            for f in flags
        ],
        key=lambda d: (d["check_id"], d["id"], d["column_name"], d["enumerator_id"]),
    )


class TestDeterminism:
    def test_same_data_same_flags(self, simple_df, base_mapping, base_config):
        """Two runs with same data + config produce identical flags (ignoring run_id/created_at)."""
        flags1, _ = run_checks(simple_df, base_mapping, base_config, "run-1")
        flags2, _ = run_checks(simple_df, base_mapping, base_config, "run-2")
        assert _normalize_flags(flags1) == _normalize_flags(flags2)

    def test_five_runs_all_match(self, simple_df, base_mapping, base_config):
        """Run 5 times, all normalized outputs must be identical."""
        results = []
        for i in range(5):
            flags, _ = run_checks(simple_df, base_mapping, base_config, f"run-{i}")
            results.append(_normalize_flags(flags))
        for i in range(1, 5):
            assert results[0] == results[i], f"Run 0 != Run {i}"

    def test_different_run_ids_match_after_normalization(self, simple_df, base_mapping, base_config):
        """Different UUIDs as run_ids still produce identical normalized output."""
        id1 = str(uuid.uuid4())
        id2 = str(uuid.uuid4())
        flags1, _ = run_checks(simple_df, base_mapping, base_config, id1)
        flags2, _ = run_checks(simple_df, base_mapping, base_config, id2)
        norm1 = _normalize_flags(flags1)
        norm2 = _normalize_flags(flags2)
        assert norm1 == norm2
