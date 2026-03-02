"""Tests for configuration loading and merging."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from d2e_engine.config import DEFAULT_CONFIG, load_config


class TestConfig:
    def test_default_config_complete(self):
        """DEFAULT_CONFIG has all expected keys."""
        required_keys = [
            "zscore_threshold",
            "missing_warning_threshold",
            "missing_critical_threshold",
            "range_rules",
            "allowed_values_rules",
            "excluded_columns",
            "duration_mode",
            "duration_column",
            "duration_unit",
            "duration_start_column",
            "duration_end_column",
            "min_duration_minutes",
            "max_duration_minutes",
            "heaping_multiple",
            "heaping_ceiling",
            "missingness_enumerator_deviation",
            "missingness_enumerator_min_rows",
            "enumerator_anomaly_deviation",
            "enumerator_anomaly_min_flags",
        ]
        for key in required_keys:
            assert key in DEFAULT_CONFIG, f"Missing key: {key}"

    def test_load_config_none(self):
        """load_config(None) returns copy of defaults."""
        config = load_config(None)
        assert config == DEFAULT_CONFIG
        # Should be a copy, not the same object
        config["zscore_threshold"] = 999
        assert DEFAULT_CONFIG["zscore_threshold"] != 999

    def test_override_merging(self):
        """Override file merges over defaults."""
        overrides = {"zscore_threshold": 2.5, "custom_key": "hello"}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            path.write_text(json.dumps(overrides))
            config = load_config(path)
        assert config["zscore_threshold"] == 2.5
        assert config["custom_key"] == "hello"
        # Non-overridden defaults preserved
        assert config["missing_warning_threshold"] == 0.20

    def test_shallow_merge_behavior(self):
        """Nested values like range_rules are replaced, not deep-merged."""
        overrides = {"range_rules": [{"column": "age", "min": 0, "max": 120}]}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            path.write_text(json.dumps(overrides))
            config = load_config(path)
        assert config["range_rules"] == [{"column": "age", "min": 0, "max": 120}]
