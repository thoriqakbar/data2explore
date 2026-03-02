"""Tests for the decisions module: load, save, apply, edge cases."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from d2e_engine.checks.base import build_flag_row
from d2e_engine.decisions import (
    Decision,
    apply_decisions,
    flag_key_str,
    load_decisions,
    save_decisions,
)


def _make_flag(**overrides):
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


class TestFlagKeyStr:
    def test_basic(self):
        f = _make_flag(id="R1", check_id="CHK-005", column_name="income")
        assert flag_key_str(f) == "R1|CHK-005|income"

    def test_empty_fields(self):
        f = _make_flag(id="", check_id="CHK-001", column_name="")
        assert flag_key_str(f) == "|CHK-001|"


class TestLoadDecisions:
    def test_load_missing_file(self):
        assert load_decisions("/nonexistent/decisions.json") == {}

    def test_load_none(self):
        assert load_decisions(None) == {}

    def test_load_empty_file(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump({}, f)
            path = f.name
        assert load_decisions(path) == {}

    def test_load_valid(self):
        data = {
            "schema_version": 1,
            "dataset_hash": "abc",
            "updated_at": "2026-01-01T00:00:00Z",
            "decisions": {
                "R1|CHK-001|col": {
                    "status": "dismissed",
                    "reason": "accepted",
                    "note": "OK",
                    "observed_value_at_decision": "42",
                    "decided_at": "2026-01-01T00:00:00Z",
                    "decided_by": "app",
                }
            },
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(data, f)
            path = f.name
        decisions = load_decisions(path)
        assert len(decisions) == 1
        assert "R1|CHK-001|col" in decisions
        d = decisions["R1|CHK-001|col"]
        assert d.status == "dismissed"
        assert d.note == "OK"

    def test_load_malformed_json(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write("not json")
            path = f.name
        assert load_decisions(path) == {}

    def test_load_non_dict(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump([1, 2, 3], f)
            path = f.name
        assert load_decisions(path) == {}


class TestSaveDecisions:
    def test_roundtrip(self):
        decisions = {
            "R1|CHK-001|col": Decision(
                status="dismissed",
                reason="accepted",
                note="Test note",
                observed_value_at_decision="42",
                decided_by="app",
            ),
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "decisions.json"
            save_decisions(decisions, "hash123", path)

            assert path.exists()
            with path.open() as f:
                raw = json.load(f)
            assert raw["schema_version"] == 1
            assert raw["dataset_hash"] == "hash123"
            assert "R1|CHK-001|col" in raw["decisions"]

            # Reload and verify
            loaded = load_decisions(path)
            assert len(loaded) == 1
            assert loaded["R1|CHK-001|col"].note == "Test note"


class TestApplyDecisions:
    def test_no_decisions_returns_all_active(self):
        flags = [_make_flag(id="R1"), _make_flag(id="R2")]
        active, suppressed = apply_decisions(flags, {})
        assert len(active) == 2
        assert len(suppressed) == 0

    def test_dismissed_flag_is_suppressed(self):
        flags = [
            _make_flag(id="R1", check_id="CHK-001", column_name="col"),
            _make_flag(id="R2", check_id="CHK-001", column_name="col"),
        ]
        decisions = {
            "R1|CHK-001|col": Decision(status="dismissed"),
        }
        active, suppressed = apply_decisions(flags, decisions)
        assert len(active) == 1
        assert active[0].id == "R2"
        assert len(suppressed) == 1
        assert suppressed[0].id == "R1"

    def test_open_decision_is_not_suppressed(self):
        flags = [_make_flag(id="R1", check_id="CHK-001", column_name="col")]
        decisions = {
            "R1|CHK-001|col": Decision(status="open"),
        }
        active, suppressed = apply_decisions(flags, decisions)
        assert len(active) == 1
        assert len(suppressed) == 0

    def test_decision_for_nonexistent_flag_is_harmless(self):
        flags = [_make_flag(id="R1", check_id="CHK-001", column_name="col")]
        decisions = {
            "R99|CHK-999|xyz": Decision(status="dismissed"),
        }
        active, suppressed = apply_decisions(flags, decisions)
        assert len(active) == 1
        assert len(suppressed) == 0

    def test_all_dismissed(self):
        flags = [_make_flag(id="R1", check_id="CHK-001", column_name="col")]
        decisions = {
            "R1|CHK-001|col": Decision(status="dismissed"),
        }
        active, suppressed = apply_decisions(flags, decisions)
        assert len(active) == 0
        assert len(suppressed) == 1
