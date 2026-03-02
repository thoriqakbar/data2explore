"""Tests for output module: flag serialization, summary, delta tracking."""

from __future__ import annotations

import csv
import json
import tempfile
from pathlib import Path

from d2e_engine.checks.base import FlagRow, build_flag_row
from d2e_engine.output import (
    _flag_key,
    build_summary_json,
    flags_to_csv,
    flags_to_json,
    load_prior_flags,
)


def _make_flag(**overrides) -> FlagRow:
    defaults = {
        "run_id": "test",
        "check_id": "CHK-001",
        "check_name": "Test",
        "severity": "Warning",
        "id": "R1",
        "column_name": "col",
    }
    defaults.update(overrides)
    return build_flag_row(**defaults)


class TestFlagKey:
    def test_identity(self):
        f = _make_flag(id="R1", check_id="CHK-001", column_name="age")
        assert _flag_key(f) == ("R1", "CHK-001", "age")

    def test_different_flags_different_keys(self):
        f1 = _make_flag(id="R1", check_id="CHK-001", column_name="age")
        f2 = _make_flag(id="R2", check_id="CHK-001", column_name="age")
        assert _flag_key(f1) != _flag_key(f2)


class TestBuildSummaryJson:
    def test_counts(self):
        flags = [
            _make_flag(severity="Critical", check_id="CHK-001", enumerator_id="E1"),
            _make_flag(severity="Warning", check_id="CHK-002", enumerator_id="E1"),
            _make_flag(severity="Critical", check_id="CHK-001", enumerator_id="E2"),
        ]
        summary = build_summary_json(flags, "run-1")
        assert summary["total_flags"] == 3
        assert summary["by_severity"]["Critical"] == 2
        assert summary["by_severity"]["Warning"] == 1
        assert summary["by_check"]["CHK-001"] == 2
        assert summary["by_enumerator"]["E1"] == 2

    def test_delta_new_and_resolved(self):
        prior = [_make_flag(id="R1", check_id="CHK-001", column_name="a")]
        current = [_make_flag(id="R2", check_id="CHK-001", column_name="a")]
        summary = build_summary_json(current, "run-2", prior)
        assert summary["has_prior_run"] is True
        assert summary["new_flags_count"] == 1
        assert summary["resolved_flags_count"] == 1
        assert summary["persisting_flags_count"] == 0

    def test_delta_persisting(self):
        flag = _make_flag(id="R1", check_id="CHK-001", column_name="a")
        summary = build_summary_json([flag], "run-2", [flag])
        assert summary["persisting_flags_count"] == 1
        assert summary["new_flags_count"] == 0
        assert summary["resolved_flags_count"] == 0

    def test_no_prior_run(self):
        flags = [_make_flag()]
        summary = build_summary_json(flags, "run-1")
        assert summary["has_prior_run"] is False
        assert summary["new_flags_count"] == 1


class TestCSVRoundtrip:
    def test_write_and_reload(self):
        flags = [
            _make_flag(id="R1", check_id="CHK-001", column_name="age"),
            _make_flag(id="R2", check_id="CHK-002", column_name="income"),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "flags.csv"
            flags_to_csv(flags, path)
            loaded = load_prior_flags(path)
            assert len(loaded) == 2
            assert loaded[0].id == "R1"
            assert loaded[1].check_id == "CHK-002"

    def test_load_nonexistent_returns_empty(self):
        loaded = load_prior_flags("/nonexistent/flags.csv")
        assert loaded == []

    def test_load_none_returns_empty(self):
        loaded = load_prior_flags(None)
        assert loaded == []


class TestJSONOutput:
    def test_flags_to_json_roundtrip(self):
        flags = [_make_flag(id="R1")]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "flags.json"
            flags_to_json(flags, path)
            with open(path) as f:
                data = json.load(f)
            assert len(data) == 1
            assert data[0]["id"] == "R1"
