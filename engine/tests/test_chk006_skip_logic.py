"""Tests for CHK-006: Skip Logic check.

Rule model:
  condition_groups: [ {conditions: [...]}, ... ]
  group_logic: "AND" | "OR"  (how groups combine, default "AND")
  Within each group: conditions are AND'd (all must match).
  Within each condition: values are OR'd (column in [v1, v2, ...]).
"""

from __future__ import annotations

import pandas as pd

from d2e_engine.checks.chk006_skip_logic import run


def _group(*conditions, logic="AND"):
    """Shorthand: wrap conditions into a condition group dict."""
    return {"conditions": list(conditions), "logic": logic}


def _cond(column, values):
    """Shorthand: build a condition dict."""
    return {"column": column, "values": values}


class TestCHK006SkipLogic:
    def test_no_rules_no_flags(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "q1": ["yes"], "q2": ["val"]})
        base_config["skip_rules"] = []
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_single_group_single_condition(self, base_mapping, base_config, fixed_run_id):
        """Simplest case: one group, one condition, dependent has value → flag."""
        df = pd.DataFrame({
            "resp_id": ["R1", "R2"],
            "gender": ["male", "female"],
            "pregnant": ["yes", "yes"],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [_group(_cond("gender", ["male"]))],
            "group_logic": "AND",
            "dependent_column": "pregnant",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        assert flags[0].severity == "Critical"
        assert flags[0].column_name == "pregnant"
        assert flags[0].id == "R1"

    # ── AND between groups ──

    def test_and_groups_both_met(self, base_mapping, base_config, fixed_run_id):
        """AND groups: both fire → flag."""
        df = pd.DataFrame({
            "resp_id": ["R1"],
            "gender": ["male"],
            "age_group": ["child"],
            "pregnant": ["yes"],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [
                _group(_cond("gender", ["male"])),
                _group(_cond("age_group", ["child"])),
            ],
            "group_logic": "AND",
            "dependent_column": "pregnant",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1

    def test_and_groups_one_not_met(self, base_mapping, base_config, fixed_run_id):
        """AND groups: only one fires → no flag."""
        df = pd.DataFrame({
            "resp_id": ["R1"],
            "gender": ["male"],
            "age_group": ["adult"],
            "pregnant": ["yes"],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [
                _group(_cond("gender", ["male"])),
                _group(_cond("age_group", ["child"])),
            ],
            "group_logic": "AND",
            "dependent_column": "pregnant",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    # ── OR between groups ──

    def test_or_groups_one_fires(self, base_mapping, base_config, fixed_run_id):
        """OR groups: one group fires → flag."""
        df = pd.DataFrame({
            "resp_id": ["R1"],
            "gender": ["male"],
            "age_group": ["adult"],
            "pregnant": ["yes"],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [
                _group(_cond("gender", ["male"])),
                _group(_cond("age_group", ["child"])),
            ],
            "group_logic": "OR",
            "dependent_column": "pregnant",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1

    def test_or_groups_none_fires(self, base_mapping, base_config, fixed_run_id):
        """OR groups: no group fires → no flag."""
        df = pd.DataFrame({
            "resp_id": ["R1"],
            "gender": ["female"],
            "age_group": ["adult"],
            "pregnant": ["yes"],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [
                _group(_cond("gender", ["male"])),
                _group(_cond("age_group", ["child"])),
            ],
            "group_logic": "OR",
            "dependent_column": "pregnant",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    # ── AND within group (multiple conditions) ──

    def test_and_within_group_all_met(self, base_mapping, base_config, fixed_run_id):
        """Multiple conditions in one group are AND'd — all must match."""
        df = pd.DataFrame({
            "resp_id": ["R1", "R2"],
            "employed": ["no", "no"],
            "country": ["US", "UK"],
            "salary": [50000, 60000],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [
                _group(_cond("employed", ["no"]), _cond("country", ["US"])),
            ],
            "group_logic": "AND",
            "dependent_column": "salary",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        # R1: employed=no AND country=US → flag
        # R2: employed=no AND country=UK → no flag (country doesn't match)
        assert len(flags) == 1
        assert flags[0].id == "R1"

    def test_and_within_group_partial(self, base_mapping, base_config, fixed_run_id):
        """Within a group, if only one condition matches, group doesn't fire."""
        df = pd.DataFrame({
            "resp_id": ["R1"],
            "employed": ["no"],
            "country": ["UK"],
            "salary": [50000],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [
                _group(_cond("employed", ["no"]), _cond("country", ["US"])),
            ],
            "group_logic": "AND",
            "dependent_column": "salary",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    # ── OR within group ──

    def test_or_within_group(self, base_mapping, base_config, fixed_run_id):
        """OR group: any condition in the group fires it."""
        df = pd.DataFrame({
            "resp_id": ["R1", "R2", "R3"],
            "employed": ["no", "yes", "yes"],
            "retired": ["no", "yes", "no"],
            "salary": [100, 200, 300],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [
                _group(_cond("employed", ["no"]), _cond("retired", ["yes"]), logic="OR"),
            ],
            "group_logic": "AND",
            "dependent_column": "salary",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        # R1: employed=no → group fires → flag
        # R2: retired=yes → group fires → flag
        # R3: neither → no flag
        assert len(flags) == 2

    def test_or_within_group_none_match(self, base_mapping, base_config, fixed_run_id):
        """OR group: no condition matches → group doesn't fire."""
        df = pd.DataFrame({
            "resp_id": ["R1"],
            "employed": ["yes"],
            "retired": ["no"],
            "salary": [100],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [
                _group(_cond("employed", ["no"]), _cond("retired", ["yes"]), logic="OR"),
            ],
            "group_logic": "AND",
            "dependent_column": "salary",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    # ── Mixed: OR group AND another group ──

    def test_or_group_and_and_group(self, base_mapping, base_config, fixed_run_id):
        """(employed=no OR retired=yes) AND (country=US) → salary skip."""
        df = pd.DataFrame({
            "resp_id": ["R1", "R2", "R3", "R4"],
            "employed": ["no", "yes", "yes", "no"],
            "retired": ["no", "yes", "no", "no"],
            "country": ["US", "US", "US", "UK"],
            "salary": [100, 200, 300, 400],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [
                _group(_cond("employed", ["no"]), _cond("retired", ["yes"]), logic="OR"),
                _group(_cond("country", ["US"])),
            ],
            "group_logic": "AND",
            "dependent_column": "salary",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        # R1: (employed=no → OR fires) AND (country=US) → flag
        # R2: (retired=yes → OR fires) AND (country=US) → flag
        # R3: (neither → OR fails) → no flag
        # R4: (employed=no → OR fires) AND (country=UK → fails) → no flag
        assert len(flags) == 2
        assert {f.id for f in flags} == {"R1", "R2"}

    # ── Key use case: (X AND Y) OR (Z AND C) ──

    def test_or_of_and_groups(self, base_mapping, base_config, fixed_run_id):
        """(employed=no AND age>65) OR (retired=yes AND country=US) → salary skip."""
        df = pd.DataFrame({
            "resp_id": ["R1", "R2", "R3", "R4"],
            "employed": ["no", "yes", "yes", "no"],
            "age_group": ["senior", "young", "young", "young"],
            "retired": ["no", "no", "yes", "no"],
            "country": ["UK", "US", "US", "UK"],
            "salary": [100, 200, 300, 400],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [
                _group(_cond("employed", ["no"]), _cond("age_group", ["senior"])),
                _group(_cond("retired", ["yes"]), _cond("country", ["US"])),
            ],
            "group_logic": "OR",
            "dependent_column": "salary",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        # R1: (employed=no AND age=senior) → group1 fires → flag
        # R2: neither group fires → no flag
        # R3: (retired=yes AND country=US) → group2 fires → flag
        # R4: employed=no but age=young → group1 fails; retired=no → group2 fails → no flag
        assert len(flags) == 2
        flagged_ids = {f.id for f in flags}
        assert flagged_ids == {"R1", "R3"}

    # ── Multiple values in condition (OR within values) ──

    def test_multiple_values_in_condition(self, base_mapping, base_config, fixed_run_id):
        """Values array is OR: column in [v1, v2] matches either."""
        df = pd.DataFrame({
            "resp_id": ["R1", "R2", "R3"],
            "status": ["single", "widowed", "married"],
            "spouse_name": ["John", "Jane", "Bob"],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [_group(_cond("status", ["single", "widowed"]))],
            "group_logic": "AND",
            "dependent_column": "spouse_name",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 2

    # ── Edge cases ──

    def test_nan_in_trigger_not_met(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "gender": [None], "q2": ["val"]})
        base_config["skip_rules"] = [{
            "condition_groups": [_group(_cond("gender", ["male"]))],
            "group_logic": "AND",
            "dependent_column": "q2",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_nan_in_dependent_no_flag(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "gender": ["male"], "q2": [None]})
        base_config["skip_rules"] = [{
            "condition_groups": [_group(_cond("gender", ["male"]))],
            "group_logic": "AND",
            "dependent_column": "q2",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_missing_condition_column(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "q2": ["val"]})
        base_config["skip_rules"] = [{
            "condition_groups": [_group(_cond("nonexistent", ["x"]))],
            "group_logic": "AND",
            "dependent_column": "q2",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_missing_dependent_column(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "gender": ["male"]})
        base_config["skip_rules"] = [{
            "condition_groups": [_group(_cond("gender", ["male"]))],
            "group_logic": "AND",
            "dependent_column": "nonexistent",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_multiple_rules(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R1"],
            "employed": ["no"],
            "salary": [50000],
            "employer": ["ACME"],
        })
        base_config["skip_rules"] = [
            {
                "condition_groups": [_group(_cond("employed", ["no"]))],
                "group_logic": "AND",
                "dependent_column": "salary",
            },
            {
                "condition_groups": [_group(_cond("employed", ["no"]))],
                "group_logic": "AND",
                "dependent_column": "employer",
            },
        ]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 2
        assert {f.column_name for f in flags} == {"salary", "employer"}

    def test_excluded_dependent_column(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "gender": ["male"], "pregnant": ["yes"]})
        base_config["skip_rules"] = [{
            "condition_groups": [_group(_cond("gender", ["male"]))],
            "group_logic": "AND",
            "dependent_column": "pregnant",
        }]
        base_config["excluded_columns"] = ["pregnant"]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_string_coercion(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "code": [1], "q2": ["val"]})
        base_config["skip_rules"] = [{
            "condition_groups": [_group(_cond("code", ["1"]))],
            "group_logic": "AND",
            "dependent_column": "q2",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1

    def test_flag_metadata(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R42"], "enum_id": ["E7"], "date": ["2025-03-01"],
            "q1": ["yes"], "q2": ["val"],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [_group(_cond("q1", ["yes"]))],
            "group_logic": "AND",
            "dependent_column": "q2",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        f = flags[0]
        assert f.check_id == "CHK-006"
        assert f.check_name == "Skip Logic"
        assert f.severity == "Critical"
        assert f.id == "R42"
        assert f.enumerator_id == "E7"
        assert f.survey_date == "2025-03-01"
        assert "must be missing" in f.rule_reference

    def test_empty_condition_groups(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "q2": ["val"]})
        base_config["skip_rules"] = [{
            "condition_groups": [],
            "group_logic": "AND",
            "dependent_column": "q2",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_empty_conditions_in_group(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "q2": ["val"]})
        base_config["skip_rules"] = [{
            "condition_groups": [{"conditions": []}],
            "group_logic": "AND",
            "dependent_column": "q2",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_empty_values_in_condition(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({"resp_id": ["R1"], "q1": ["yes"], "q2": ["val"]})
        base_config["skip_rules"] = [{
            "condition_groups": [_group(_cond("q1", []))],
            "group_logic": "AND",
            "dependent_column": "q2",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 0

    def test_mix_correct_and_violations(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R1", "R2", "R3"],
            "gender": ["male", "male", "female"],
            "pregnant": [None, "yes", "yes"],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [_group(_cond("gender", ["male"]))],
            "group_logic": "AND",
            "dependent_column": "pregnant",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        assert flags[0].id == "R2"

    def test_rule_reference_shows_and_within_groups(self, base_mapping, base_config, fixed_run_id):
        """Rule reference uses AND within groups, group_logic between."""
        df = pd.DataFrame({
            "resp_id": ["R1"], "a": ["x"], "b": ["y"], "c": ["z"], "dep": ["val"],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [
                _group(_cond("a", ["x"]), _cond("b", ["y"])),
                _group(_cond("c", ["z"])),
            ],
            "group_logic": "OR",
            "dependent_column": "dep",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        assert len(flags) == 1
        ref = flags[0].rule_reference
        assert "AND" in ref  # within group
        assert "OR" in ref   # between groups
        assert "dep must be missing" in ref

    def test_default_group_logic_is_and(self, base_mapping, base_config, fixed_run_id):
        """Missing group_logic defaults to AND."""
        df = pd.DataFrame({
            "resp_id": ["R1"],
            "gender": ["male"],
            "age_group": ["adult"],
            "pregnant": ["yes"],
        })
        base_config["skip_rules"] = [{
            "condition_groups": [
                _group(_cond("gender", ["male"])),
                _group(_cond("age_group", ["child"])),
            ],
            # no group_logic specified
            "dependent_column": "pregnant",
        }]
        flags = run(df, base_mapping, base_config, fixed_run_id)
        # Default AND: gender=male fires but age_group=child doesn't → no flag
        assert len(flags) == 0
