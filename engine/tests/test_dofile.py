"""Tests for the Stata .do file generator."""

from __future__ import annotations

from pathlib import Path

import pytest

from d2e_engine.config import DEFAULT_CONFIG
from d2e_engine.dofile import (
    _emit_chk001,
    _emit_chk002,
    _emit_chk004,
    _emit_chk005,
    _emit_chk008,
    _emit_chk009_comment,
    _emit_chk010,
    _emit_chk012,
    _emit_csv_export,
    _emit_footer,
    _emit_header,
    _emit_setup,
    _sanitize_stata_name,
    _stata_inlist,
    generate_dofile,
)


# ---------------------------------------------------------------------------
# _sanitize_stata_name
# ---------------------------------------------------------------------------

class TestSanitizeStataName:
    def test_simple_name(self):
        assert _sanitize_stata_name("income") == "income"

    def test_spaces(self):
        assert _sanitize_stata_name("total income") == "total_income"

    def test_special_chars(self):
        assert _sanitize_stata_name("income($)") == "income"

    def test_leading_digit(self):
        assert _sanitize_stata_name("3rd_column") == "_3rd_column"

    def test_hyphens_and_dots(self):
        assert _sanitize_stata_name("my-var.name") == "my_var_name"

    def test_empty_string(self):
        assert _sanitize_stata_name("") == "_col"

    def test_all_special(self):
        assert _sanitize_stata_name("@#$%") == "_col"

    def test_truncation(self):
        long_name = "a" * 50
        result = _sanitize_stata_name(long_name)
        assert len(result) == 32
        assert result == "a" * 32

    def test_unicode(self):
        result = _sanitize_stata_name("café_price")
        # The é gets stripped, but the rest survives
        assert result == "caf_price"

    def test_slash_path(self):
        assert _sanitize_stata_name("path/to/var") == "path_to_var"


# ---------------------------------------------------------------------------
# _stata_inlist
# ---------------------------------------------------------------------------

class TestStataInlist:
    def test_numeric(self):
        result = _stata_inlist("x", ["1", "2", "3"], is_string=False)
        assert result == "inlist(x, 1, 2, 3)"

    def test_string_under_10(self):
        result = _stata_inlist("x", ["a", "b", "c"], is_string=True)
        assert result == 'inlist(x, "a", "b", "c")'

    def test_string_over_10_chains(self):
        values = [f"v{i}" for i in range(12)]
        result = _stata_inlist("x", values, is_string=True)
        assert " | " in result
        # First chunk has 10, second has 2
        parts = result.split(" | ")
        assert len(parts) == 2
        assert parts[0].count('"') == 20  # 10 values × 2 quotes each
        assert parts[1].count('"') == 4   # 2 values × 2 quotes each

    def test_empty_values(self):
        assert _stata_inlist("x", [], is_string=True) == "0"


# ---------------------------------------------------------------------------
# _emit_header
# ---------------------------------------------------------------------------

class TestEmitHeader:
    def test_contains_run_id(self):
        result = _emit_header("run-123", "/data/survey.dta", {})
        assert "run-123" in result

    def test_contains_timestamp(self):
        result = _emit_header("run-123", "/data/survey.dta", {})
        assert "Generated:" in result

    def test_contains_instructions(self):
        result = _emit_header("run-123", "/data/survey.dta", {})
        assert "Ctrl+D" in result


# ---------------------------------------------------------------------------
# _emit_setup
# ---------------------------------------------------------------------------

class TestEmitSetup:
    def test_use_command_for_dta(self, base_mapping, base_config):
        result = _emit_setup("/data/survey.dta", base_config, base_mapping, ["resp_id", "age"])
        assert 'use "/data/survey.dta", clear' in result

    def test_import_delimited_for_csv(self, base_mapping, base_config):
        result = _emit_setup("/data/survey.csv", base_config, base_mapping, ["resp_id"])
        assert 'import delimited using "/data/survey.csv", clear' in result

    def test_import_excel_for_xlsx(self, base_mapping, base_config):
        result = _emit_setup("/data/survey.xlsx", base_config, base_mapping, ["resp_id"])
        assert 'import excel using "/data/survey.xlsx", firstrow clear' in result

    def test_backslash_normalization(self, base_mapping, base_config):
        result = _emit_setup("C:\\Users\\data\\survey.dta", base_config, base_mapping, [])
        assert "C:/Users/data/survey.dta" in result
        assert "\\" not in result.split("use")[1].split("\n")[0]

    def test_mapped_columns(self, base_mapping, base_config):
        result = _emit_setup("/data.dta", base_config, base_mapping, [])
        assert '"resp_id"' in result
        assert '"enum_id"' in result
        assert '"date"' in result

    def test_thresholds(self, base_mapping, base_config):
        result = _emit_setup("/data.dta", base_config, base_mapping, [])
        assert "local zscore_threshold" in result
        assert "3.0" in result
        assert "local miss_warn_threshold" in result
        assert "0.2" in result

    def test_custom_thresholds(self, base_mapping):
        config = dict(DEFAULT_CONFIG, zscore_threshold=2.5)
        result = _emit_setup("/data.dta", config, base_mapping, [])
        assert "2.5" in result

    def test_duration_column_mode(self, base_mapping, base_config):
        result = _emit_setup("/data.dta", base_config, base_mapping, [])
        assert 'local duration_col' in result

    def test_duration_start_end_mode(self, base_mapping):
        config = dict(DEFAULT_CONFIG, duration_mode="start_end",
                      duration_start_column="start_time", duration_end_column="end_time")
        result = _emit_setup("/data.dta", config, base_mapping, [])
        assert 'local dur_start_col' in result
        assert 'local dur_end_col' in result

    def test_column_renames(self, base_mapping, base_config):
        columns = ["valid_col", "has space", "3bad"]
        result = _emit_setup("/data.dta", base_config, base_mapping, columns)
        assert "rename" in result
        assert "has_space" in result
        assert "_3bad" in result


# ---------------------------------------------------------------------------
# _emit_chk001
# ---------------------------------------------------------------------------

class TestEmitChk001:
    def test_duplicates_tag(self, base_mapping, base_config):
        result = _emit_chk001(base_mapping, base_config)
        assert "duplicates tag" in result
        assert "d2e_flag_chk001" in result

    def test_contains_severity(self, base_mapping, base_config):
        result = _emit_chk001(base_mapping, base_config)
        assert "Critical" in result

    def test_displays_count(self, base_mapping, base_config):
        result = _emit_chk001(base_mapping, base_config)
        assert "CHK-001:" in result
        assert "flags" in result


# ---------------------------------------------------------------------------
# _emit_chk002
# ---------------------------------------------------------------------------

class TestEmitChk002:
    def test_uses_foreach_loop(self):
        config = dict(DEFAULT_CONFIG)
        columns = ["income", "age", "gender"]
        result = _emit_chk002(config, columns)
        assert "foreach var of local _chk002_cols" in result
        assert "missing(`var')" in result

    def test_column_list_in_local(self):
        config = dict(DEFAULT_CONFIG)
        columns = ["income", "age", "gender"]
        result = _emit_chk002(config, columns)
        assert 'local _chk002_cols "income age gender"' in result

    def test_excludes_columns(self):
        config = dict(DEFAULT_CONFIG, excluded_columns=["age"])
        columns = ["income", "age", "gender"]
        result = _emit_chk002(config, columns)
        assert "income" in result
        assert "age" not in result

    def test_empty_columns(self):
        config = dict(DEFAULT_CONFIG)
        result = _emit_chk002(config, [])
        assert "No columns to analyse" in result

    def test_threshold_references(self):
        config = dict(DEFAULT_CONFIG)
        result = _emit_chk002(config, ["income"])
        assert "miss_crit_threshold" in result
        assert "miss_warn_threshold" in result


# ---------------------------------------------------------------------------
# _emit_chk004
# ---------------------------------------------------------------------------

class TestEmitChk004:
    def test_uses_foreach_loop(self, base_mapping, base_config):
        result = _emit_chk004(base_mapping, base_config, ["income", "age"])
        assert "foreach var of local _chk004_cols" in result
        assert "bysort" in result
        assert "enumerator_col" in result

    def test_column_list_in_local(self, base_mapping, base_config):
        result = _emit_chk004(base_mapping, base_config, ["income", "age"])
        assert 'local _chk004_cols "income age"' in result

    def test_skips_without_enumerator(self, base_config):
        result = _emit_chk004({}, base_config, ["income"])
        assert "Skipped" in result

    def test_excludes_mapping_columns(self, base_mapping, base_config):
        columns = ["resp_id", "enum_id", "date", "income"]
        result = _emit_chk004(base_mapping, base_config, columns)
        # Only 'income' should appear in the column list
        assert 'local _chk004_cols "income"' in result
        # Mapping columns should NOT appear in the column list
        assert "resp_id" not in result.split("_chk004_cols")[1].split('"')[1]

    def test_flag_variable_created(self, base_mapping, base_config):
        result = _emit_chk004(base_mapping, base_config, ["income"])
        assert "d2e_flag_chk004" in result


# ---------------------------------------------------------------------------
# _emit_chk005
# ---------------------------------------------------------------------------

class TestEmitChk005:
    def test_no_rules(self):
        config = dict(DEFAULT_CONFIG)
        result = _emit_chk005(config)
        assert "No range rules configured" in result

    def test_min_max_rule(self):
        config = dict(DEFAULT_CONFIG, range_rules=[
            {"column": "age", "min": 18, "max": 120}
        ])
        result = _emit_chk005(config)
        assert "age < 18" in result
        assert "age > 120" in result
        assert "d2e_flag_chk005_age" in result

    def test_min_only(self):
        config = dict(DEFAULT_CONFIG, range_rules=[
            {"column": "income", "min": 0}
        ])
        result = _emit_chk005(config)
        assert "income < 0" in result
        # Should not generate a max condition (only label mentions '.')
        assert "income > " not in result.split("gen d2e_flag")[1].split("\n")[0]

    def test_max_only(self):
        config = dict(DEFAULT_CONFIG, range_rules=[
            {"column": "score", "max": 100}
        ])
        result = _emit_chk005(config)
        assert "score > 100" in result

    def test_excluded_column(self):
        config = dict(DEFAULT_CONFIG,
                      range_rules=[{"column": "age", "min": 0, "max": 120}],
                      excluded_columns=["age"])
        result = _emit_chk005(config)
        assert "d2e_flag_chk005_age" not in result


# ---------------------------------------------------------------------------
# _emit_chk008
# ---------------------------------------------------------------------------

class TestEmitChk008:
    def test_uses_foreach_loop(self):
        config = dict(DEFAULT_CONFIG)
        result = _emit_chk008(config, ["income", "age"])
        assert "foreach var of local _chk008_cols" in result
        assert "capture confirm numeric variable `var'" in result

    def test_column_list_in_local(self):
        config = dict(DEFAULT_CONFIG)
        result = _emit_chk008(config, ["income", "age"])
        assert 'local _chk008_cols "income age"' in result

    def test_dynamic_flag_variable(self):
        config = dict(DEFAULT_CONFIG)
        result = _emit_chk008(config, ["income"])
        assert 'substr("d2e_flag_chk008_"' in result

    def test_zscore_threshold_reference(self):
        config = dict(DEFAULT_CONFIG)
        result = _emit_chk008(config, ["income"])
        assert "zscore_threshold" in result

    def test_empty_columns(self):
        config = dict(DEFAULT_CONFIG)
        result = _emit_chk008(config, [])
        assert "No columns to analyse" in result


# ---------------------------------------------------------------------------
# _emit_chk010
# ---------------------------------------------------------------------------

class TestEmitChk010:
    def test_column_mode_minutes(self):
        config = dict(DEFAULT_CONFIG, duration_mode="column", duration_unit="minutes")
        result = _emit_chk010(config)
        assert "_d2e_dur_minutes = `duration_col'" in result
        assert "d2e_flag_chk010_impossible" in result
        assert "d2e_flag_chk010_short" in result
        assert "d2e_flag_chk010_long" in result
        assert "d2e_flag_chk010_heaped" in result

    def test_column_mode_seconds(self):
        config = dict(DEFAULT_CONFIG, duration_mode="column", duration_unit="seconds")
        result = _emit_chk010(config)
        assert "/ 60" in result

    def test_start_end_mode(self):
        config = dict(DEFAULT_CONFIG, duration_mode="start_end")
        result = _emit_chk010(config)
        assert "dur_start_col" in result
        assert "dur_end_col" in result
        assert "clock(" in result

    def test_none_mode(self):
        config = dict(DEFAULT_CONFIG, duration_mode="none")
        result = _emit_chk010(config)
        assert "skipped" in result.lower()

    def test_mad_calculation(self):
        config = dict(DEFAULT_CONFIG)
        result = _emit_chk010(config)
        assert "_dur_mad" in result
        assert "p50" in result


# ---------------------------------------------------------------------------
# _emit_chk012
# ---------------------------------------------------------------------------

class TestEmitChk012:
    def test_no_rules(self):
        config = dict(DEFAULT_CONFIG)
        result = _emit_chk012(config)
        assert "No allowed-values rules configured" in result

    def test_numeric_values(self):
        config = dict(DEFAULT_CONFIG, allowed_values_rules=[
            {"column": "gender", "values": [1, 2, 3]}
        ])
        result = _emit_chk012(config)
        assert "inlist(gender, 1, 2, 3)" in result
        assert "d2e_flag_chk012_gender" in result

    def test_string_values(self):
        config = dict(DEFAULT_CONFIG, allowed_values_rules=[
            {"column": "status", "values": ["active", "inactive"]}
        ])
        result = _emit_chk012(config)
        assert '"active"' in result
        assert '"inactive"' in result

    def test_many_string_values_chains(self):
        config = dict(DEFAULT_CONFIG, allowed_values_rules=[
            {"column": "region", "values": [f"R{i}" for i in range(15)]}
        ])
        result = _emit_chk012(config)
        assert " | " in result

    def test_excluded_column(self):
        config = dict(DEFAULT_CONFIG,
                      allowed_values_rules=[{"column": "status", "values": ["a", "b"]}],
                      excluded_columns=["status"])
        result = _emit_chk012(config)
        assert "d2e_flag_chk012_status" not in result


# ---------------------------------------------------------------------------
# _emit_chk009_comment
# ---------------------------------------------------------------------------

class TestEmitChk009:
    def test_is_comment_only(self):
        result = _emit_chk009_comment()
        # Should be a block comment (may contain example commands inside the comment)
        assert "SKIPPED" in result
        assert "aggregates" in result.lower() or "meta-check" in result.lower()
        # The entire output should be inside a block comment — no executable code outside /* */
        stripped = result.strip()
        assert stripped.startswith("/*")
        assert stripped.endswith("*/")


# ---------------------------------------------------------------------------
# _emit_csv_export
# ---------------------------------------------------------------------------

class TestEmitCsvExport:
    def test_export_command(self):
        result = _emit_csv_export("/output/checks")
        assert "export delimited" in result
        assert "stata_flags.csv" in result

    def test_backslash_normalization(self):
        result = _emit_csv_export("C:\\output\\checks")
        assert "C:/output/checks" in result


# ---------------------------------------------------------------------------
# _emit_footer
# ---------------------------------------------------------------------------

class TestEmitFooter:
    def test_summary_message(self):
        result = _emit_footer()
        assert "complete" in result.lower()
        assert "d2e_flag_*" in result


# ---------------------------------------------------------------------------
# generate_dofile (end-to-end)
# ---------------------------------------------------------------------------

class TestGenerateDofile:
    def test_writes_file(self, base_mapping, base_config, tmp_path):
        out = tmp_path / "export_checks.do"
        result = generate_dofile(
            config=base_config,
            mapping=base_mapping,
            run_id="test-run-001",
            dataset_path="/data/survey.dta",
            out_path=out,
            columns=["resp_id", "enum_id", "date", "income", "age"],
        )
        assert result == out
        assert out.exists()
        content = out.read_text(encoding="utf-8")
        assert len(content) > 100

    def test_all_sections_present(self, base_mapping, base_config, tmp_path):
        out = tmp_path / "test.do"
        generate_dofile(
            config=base_config,
            mapping=base_mapping,
            run_id="run-xyz",
            dataset_path="/data/survey.dta",
            out_path=out,
            columns=["resp_id", "enum_id", "income"],
        )
        content = out.read_text(encoding="utf-8")
        # Header
        assert "run-xyz" in content
        # Setup
        assert "clear all" in content
        assert "use" in content
        # All checks present
        assert "CHK-001" in content
        assert "CHK-002" in content
        assert "CHK-004" in content
        assert "CHK-008" in content
        assert "CHK-009" in content
        assert "CHK-010" in content
        # Export
        assert "export delimited" in content
        # Footer
        assert "replication complete" in content

    def test_selected_checks_filters(self, base_mapping, base_config, tmp_path):
        out = tmp_path / "filtered.do"
        generate_dofile(
            config=base_config,
            mapping=base_mapping,
            run_id="run-001",
            dataset_path="/data.dta",
            out_path=out,
            selected_check_ids=["CHK-001", "CHK-005"],
            columns=["resp_id", "income"],
        )
        content = out.read_text(encoding="utf-8")
        assert "CHK-001" in content
        # CHK-002 should NOT be present
        assert "CHK-002: Missingness" not in content
        # CHK-008 should NOT be present
        assert "d2e_flag_chk008" not in content

    def test_custom_range_rules(self, base_mapping, tmp_path):
        config = dict(DEFAULT_CONFIG, range_rules=[
            {"column": "age", "min": 18, "max": 120},
            {"column": "income", "min": 0},
        ])
        out = tmp_path / "custom.do"
        generate_dofile(
            config=config,
            mapping=base_mapping,
            run_id="run-002",
            dataset_path="/data.dta",
            out_path=out,
            columns=["resp_id", "age", "income"],
        )
        content = out.read_text(encoding="utf-8")
        assert "d2e_flag_chk005_age" in content
        assert "d2e_flag_chk005_income" in content
        assert "age < 18" in content
        assert "age > 120" in content
        assert "income < 0" in content

    def test_custom_allowed_values(self, base_mapping, tmp_path):
        config = dict(DEFAULT_CONFIG, allowed_values_rules=[
            {"column": "gender", "values": ["M", "F", "Other"]}
        ])
        out = tmp_path / "av.do"
        generate_dofile(
            config=config,
            mapping=base_mapping,
            run_id="run-003",
            dataset_path="/data.dta",
            out_path=out,
            columns=["resp_id", "gender"],
        )
        content = out.read_text(encoding="utf-8")
        assert "d2e_flag_chk012_gender" in content
        assert '"M"' in content

    def test_column_sanitization_in_full_run(self, base_mapping, base_config, tmp_path):
        out = tmp_path / "sanitize.do"
        generate_dofile(
            config=base_config,
            mapping=base_mapping,
            run_id="run-004",
            dataset_path="/data.dta",
            out_path=out,
            columns=["resp_id", "total income", "3rd var"],
        )
        content = out.read_text(encoding="utf-8")
        assert "rename" in content
        assert "total_income" in content
        assert "_3rd_var" in content

    def test_no_columns(self, base_mapping, base_config, tmp_path):
        """generate_dofile still works when columns list is empty."""
        out = tmp_path / "empty.do"
        generate_dofile(
            config=base_config,
            mapping=base_mapping,
            run_id="run-005",
            dataset_path="/data.dta",
            out_path=out,
            columns=[],
        )
        assert out.exists()
        content = out.read_text(encoding="utf-8")
        assert "clear all" in content

    def test_creates_parent_directory(self, base_mapping, base_config, tmp_path):
        out = tmp_path / "nested" / "dir" / "test.do"
        generate_dofile(
            config=base_config,
            mapping=base_mapping,
            run_id="run-006",
            dataset_path="/data.dta",
            out_path=out,
            columns=[],
        )
        assert out.exists()

    def test_duration_none_mode(self, base_mapping, tmp_path):
        config = dict(DEFAULT_CONFIG, duration_mode="none")
        out = tmp_path / "nodur.do"
        generate_dofile(
            config=config,
            mapping=base_mapping,
            run_id="run-007",
            dataset_path="/data.dta",
            out_path=out,
            columns=["resp_id"],
        )
        content = out.read_text(encoding="utf-8")
        assert "CHK-010" in content
        assert "skipped" in content.lower() or "none" in content.lower()

    def test_chk009_always_comment(self, base_mapping, base_config, tmp_path):
        out = tmp_path / "chk009.do"
        generate_dofile(
            config=base_config,
            mapping=base_mapping,
            run_id="run-008",
            dataset_path="/data.dta",
            out_path=out,
            columns=["resp_id"],
        )
        content = out.read_text(encoding="utf-8")
        assert "CHK-009" in content
        assert "SKIPPED" in content
