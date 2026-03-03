"""Stata .do file generator — replicates data2explore HFC checks as a runnable Stata script.

Produces a human-readable, editable .do file that RAs can run in Stata to verify
the app's results independently and customize thresholds for their project.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sanitize_stata_name(name: str) -> str:
    """Convert an arbitrary column name to a valid Stata variable name.

    Stata rules: <= 32 chars, [A-Za-z_][A-Za-z0-9_]*, no special chars.
    """
    # Replace common separators with underscore
    s = re.sub(r"[\s\-./]+", "_", name)
    # Strip anything that isn't alphanumeric or underscore
    s = re.sub(r"[^A-Za-z0-9_]", "", s)
    # Must start with a letter or underscore
    if s and s[0].isdigit():
        s = "_" + s
    if not s:
        s = "_col"
    # Truncate to 32 characters
    return s[:32]


def _needs_rename(original: str) -> bool:
    """Return True if a column name is not already a valid Stata variable name."""
    return _sanitize_stata_name(original) != original


def _truncvar(prefix: str, suffix: str) -> str:
    """Build a Stata variable name, truncating suffix to fit the 32-char limit."""
    max_suffix = 32 - len(prefix)
    if max_suffix <= 0:
        return prefix[:32]
    return prefix + suffix[:max_suffix]


def _stata_inlist(var: str, values: list[str], is_string: bool) -> str:
    """Build a Stata inlist() expression, chaining for >10 string values.

    Stata inlist() supports max 10 string arguments or 255 numeric.
    For >10 strings we chain multiple inlist() calls with |.
    """
    if not values:
        return "0"

    if is_string:
        chunks: list[str] = []
        for i in range(0, len(values), 10):
            batch = values[i : i + 10]
            quoted = ", ".join(f'"{v}"' for v in batch)
            chunks.append(f"inlist({var}, {quoted})")
        return " | ".join(chunks)
    else:
        # Numeric — up to 255 in one call, practically always fits
        nums = ", ".join(str(v) for v in values)
        return f"inlist({var}, {nums})"


# ---------------------------------------------------------------------------
# Section emitters — each returns a Stata code block as a string
# ---------------------------------------------------------------------------

def _emit_header(run_id: str, dataset_path: str, config: dict[str, Any]) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return f"""\
/*===========================================================================
  data2explore  —  HFC Check Replication Script
  Generated: {ts}
  Run ID:    {run_id}

  This script replicates the High-Frequency Checks performed by data2explore.
  Thresholds are defined as local macros below — edit them to customize.

  To run: Open in Stata, verify the file path below, then execute (Ctrl+D).
===========================================================================*/
"""


def _emit_setup(
    dataset_path: str,
    config: dict[str, Any],
    mapping: dict[str, str],
    columns: list[str],
) -> str:
    # Normalize path for Stata (forward slashes)
    stata_path = dataset_path.replace("\\", "/")

    # Choose load command based on file extension
    ext = Path(dataset_path).suffix.lower()
    if ext == ".dta":
        load_cmd = f'use "{stata_path}", clear'
    elif ext in (".csv", ".txt", ".tsv"):
        load_cmd = f'import delimited using "{stata_path}", clear'
    elif ext in (".xls", ".xlsx"):
        load_cmd = f'import excel using "{stata_path}", firstrow clear'
    else:
        load_cmd = f'use "{stata_path}", clear'

    lines = [
        "clear all",
        "set more off",
        "",
        '* ── Data ──────────────────────────────────────────',
        load_cmd,
        "",
    ]

    # Rename columns that aren't valid Stata names
    renames = [(c, _sanitize_stata_name(c)) for c in columns if _needs_rename(c)]
    if renames:
        lines.append("* ── Column renames (original → Stata-safe) ─────────")
        for orig, safe in renames:
            lines.append(f'rename `"{orig}"\' {safe}  /* was: {orig} */')
        lines.append("")

    # Mapped columns — use sanitized names
    id_col = _sanitize_stata_name(mapping.get("id", ""))
    enum_col = _sanitize_stata_name(mapping.get("enumerator_id", ""))
    date_col = _sanitize_stata_name(mapping.get("survey_date", ""))

    lines.append('* ── Mapped columns ────────────────────────────────')
    lines.append(f'local id_col           "{id_col}"')
    lines.append(f'local enumerator_col   "{enum_col}"')
    lines.append(f'local survey_date_col  "{date_col}"')

    # Duration mapping
    mode = config.get("duration_mode", "column")
    if mode == "column":
        dur_col = _sanitize_stata_name(config.get("duration_column", "duration_minutes"))
        lines.append(f'local duration_col     "{dur_col}"')
    elif mode == "start_end":
        start_col = _sanitize_stata_name(config.get("duration_start_column", ""))
        end_col = _sanitize_stata_name(config.get("duration_end_column", ""))
        lines.append(f'local dur_start_col    "{start_col}"')
        lines.append(f'local dur_end_col      "{end_col}"')

    lines.append("")
    lines.append('* ── Thresholds (edit these to customize) ──────────')
    lines.append(f'local zscore_threshold     {config.get("zscore_threshold", 3.0)}')
    lines.append(f'local miss_warn_threshold  {config.get("missing_warning_threshold", 0.20)}')
    lines.append(f'local miss_crit_threshold  {config.get("missing_critical_threshold", 0.50)}')
    lines.append(f'local enum_deviation       {config.get("missingness_enumerator_deviation", 2.0)}')
    lines.append(f'local enum_min_rows        {config.get("missingness_enumerator_min_rows", 10)}')
    lines.append(f'local dur_deviation        {config.get("duration_deviation_factor", 3.0)}')
    lines.append(f'local dur_min_obs          {config.get("duration_min_observations", 5)}')
    lines.append(f'local heap_multiple        {config.get("heaping_multiple", 5)}')
    lines.append(f'local heap_ceiling         {config.get("heaping_ceiling", 15)}')
    lines.append("")

    return "\n".join(lines) + "\n"


def _emit_chk001(mapping: dict[str, str], config: dict[str, Any]) -> str:
    return """\
/*───────────────────────────────────────────────────
  CHK-001: Duplicate ID | Severity: Critical
  Rule: ID appears more than once
  Note: This flags EVERY row with a duplicate ID. The data2explore app
  reports one flag per unique duplicate ID, so the count here will be
  higher (e.g. 2 rows sharing the same ID = 2 flagged rows here,
  but 1 flag in the app).
───────────────────────────────────────────────────*/

duplicates tag `id_col', gen(_d2e_chk001_dup)
gen d2e_flag_chk001 = (_d2e_chk001_dup > 0) if !missing(`id_col')
label var d2e_flag_chk001 "CHK-001: Duplicate ID"
drop _d2e_chk001_dup

quietly count if d2e_flag_chk001 == 1
di as text "CHK-001: " as result r(N) as text " row-level flags"

"""


def _emit_chk002(config: dict[str, Any], columns: list[str]) -> str:
    excluded = set(config.get("excluded_columns", []))
    analysis_cols = [c for c in columns if c not in excluded]

    if not analysis_cols:
        return "* CHK-002: No columns to analyse (all excluded)\n\n"

    safe_cols = [_sanitize_stata_name(c) for c in analysis_cols]
    col_list = " ".join(safe_cols)

    lines = [
        '/*───────────────────────────────────────────────────',
        '  CHK-002: Missingness by Variable | Severity: Warning/Critical',
        '  Rule: Column missing rate exceeds threshold',
        '───────────────────────────────────────────────────*/',
        '',
        '* Display missing rates per column',
        'di as text _newline "CHK-002: Missingness by Variable"',
        'di as text "{hline 60}"',
        'di as text %30s "Variable" _col(35) %10s "Missing" _col(48) %10s "Rate" _col(60) "Flag"',
        'di as text "{hline 60}"',
        '',
        f'local _chk002_cols "{col_list}"',
        "foreach var of local _chk002_cols {",
        "    quietly count if missing(`var')",
        "    local _miss = r(N)",
        "    local _rate = r(N) / _N",
        "    if `_rate' > `miss_crit_threshold' {",
        '        di as text %30s "`var\'" _col(35) as result %10.0f `_miss\' _col(48) as result %10.3f `_rate\' _col(60) as error "CRITICAL"',
        "    }",
        "    else if `_rate' > `miss_warn_threshold' {",
        '        di as text %30s "`var\'" _col(35) as result %10.0f `_miss\' _col(48) as result %10.3f `_rate\' _col(60) as error "WARNING"',
        "    }",
        "}",
        '',
        'di as text "{hline 60}"',
        '',
    ]

    return "\n".join(lines) + "\n"


def _emit_chk004(mapping: dict[str, str], config: dict[str, Any], columns: list[str]) -> str:
    raw_enum = mapping.get("enumerator_id", "")
    if not raw_enum:
        return "* CHK-004: Skipped — no enumerator_id mapped\n\n"

    enum_col = _sanitize_stata_name(raw_enum)

    # Exclude mapping columns from analysis
    mapping_cols = {_sanitize_stata_name(v) for v in mapping.values() if v}
    excluded = set(_sanitize_stata_name(c) for c in config.get("excluded_columns", []))
    analysis_cols = [
        _sanitize_stata_name(c)
        for c in columns
        if _sanitize_stata_name(c) not in mapping_cols and _sanitize_stata_name(c) not in excluded
    ]

    if not analysis_cols:
        return "* CHK-004: No analysis columns available\n\n"

    col_list = " ".join(analysis_cols)

    lines = [
        '/*───────────────────────────────────────────────────',
        '  CHK-004: Missingness by Enumerator | Severity: Warning',
        '  Rule: Enumerator missing rate > deviation_factor * baseline',
        '  Note: This flags every ROW belonging to an offending enumerator.',
        '  The data2explore app reports one flag per (column, enumerator)',
        '  pair, so the count here will be higher.',
        '───────────────────────────────────────────────────*/',
        '',
        'di as text _newline "CHK-004: Missingness by Enumerator"',
        '',
        'tempvar _chk004_flag',
        "gen `_chk004_flag' = 0",
        '',
        f'local _chk004_cols "{col_list}"',
        "foreach var of local _chk004_cols {",
        "    quietly count if missing(`var')",
        "    local _base_miss = r(N) / _N",
        "    if `_base_miss' >= 0.01 {",
        "        bysort `enumerator_col': egen _d2e_emiss = mean(missing(`var'))",
        "        bysort `enumerator_col': gen _d2e_ecount = _N",
        "        replace `_chk004_flag' = 1 if _d2e_emiss > `_base_miss' * `enum_deviation' & _d2e_ecount >= `enum_min_rows'",
        "        drop _d2e_emiss _d2e_ecount",
        "    }",
        "}",
        '',
        "gen d2e_flag_chk004 = `_chk004_flag'",
        'label var d2e_flag_chk004 "CHK-004: Missingness by Enumerator"',
        "drop `_chk004_flag'",
        '',
        'quietly count if d2e_flag_chk004 == 1',
        'di as text "CHK-004: " as result r(N) as text " flags"',
        '',
    ]

    return "\n".join(lines) + "\n"


def _emit_chk005(config: dict[str, Any]) -> str:
    range_rules: list[dict[str, Any]] = config.get("range_rules", [])
    if not range_rules:
        return "* CHK-005: No range rules configured — skipped\n\n"

    excluded = set(config.get("excluded_columns", []))

    lines = [
        '/*───────────────────────────────────────────────────',
        '  CHK-005: Range Check | Severity: Critical',
        '  Rule: Value outside user-defined min/max bounds',
        '───────────────────────────────────────────────────*/',
        '',
    ]

    for rule in range_rules:
        col = rule.get("column", "")
        if not col or col in excluded:
            continue
        safe = _sanitize_stata_name(col)
        rule_min = rule.get("min")
        rule_max = rule.get("max")
        if rule_min is None and rule_max is None:
            continue

        conditions = []
        if rule_min is not None:
            conditions.append(f"{safe} < {rule_min}")
        if rule_max is not None:
            conditions.append(f"{safe} > {rule_max}")

        condition = " | ".join(conditions)
        label_parts = []
        if rule_min is not None:
            label_parts.append(f">= {rule_min}")
        if rule_max is not None:
            label_parts.append(f"<= {rule_max}")

        flagvar = _truncvar("d2e_flag_chk005_", safe)
        lines.append(f'* Range rule: {safe} {" and ".join(label_parts)}')
        lines.append(f'gen {flagvar} = ({condition}) if !missing({safe})')
        range_label = f"[{rule_min if rule_min is not None else '.'}, {rule_max if rule_max is not None else '.'}]"
        lines.append(f'label var {flagvar} "CHK-005: Range {range_label} for {safe}"')
        lines.append(f'quietly count if {flagvar} == 1')
        lines.append(f'di as text "CHK-005 ({safe}): " as result r(N) as text " flags"')
        lines.append('')

    return "\n".join(lines) + "\n"


def _emit_chk006(config: dict[str, Any]) -> str:
    rules: list[dict[str, Any]] = config.get("skip_rules", [])
    if not rules:
        return "* CHK-006: No skip rules configured — skipped\n\n"

    excluded = set(config.get("excluded_columns", []))

    lines = [
        '/*───────────────────────────────────────────────────',
        '  CHK-006: Skip Logic | Severity: Critical',
        '  Rule: If conditions are met, dependent column must be missing',
        '───────────────────────────────────────────────────*/',
        '',
    ]

    for ri, rule in enumerate(rules):
        groups: list[dict[str, Any]] = rule.get("condition_groups", [])
        group_logic: str = rule.get("group_logic", "AND").upper()
        dependent: str = rule.get("dependent_column", "")

        if not dependent or not groups or dependent in excluded:
            continue

        safe_dep = _sanitize_stata_name(dependent)

        # Build group expressions (group.logic within group, group_logic between groups)
        group_exprs: list[str] = []
        for group in groups:
            conditions = group.get("conditions", [])
            inner_logic = group.get("logic", "AND").upper()
            cond_exprs: list[str] = []
            for cond in conditions:
                col = cond.get("column", "")
                vals = cond.get("values", [])
                if not col or not vals:
                    continue
                safe_col = _sanitize_stata_name(col)
                str_values = [str(v) for v in vals]
                all_numeric = all(_is_numeric_str(v) for v in str_values)
                inlist_expr = _stata_inlist(safe_col, str_values, is_string=not all_numeric)
                cond_exprs.append(f"({inlist_expr})")
            if cond_exprs:
                inner_joiner = " | " if inner_logic == "OR" else " & "
                group_exprs.append(f"({inner_joiner.join(cond_exprs)})")

        if not group_exprs:
            continue

        # group_logic between groups
        group_joiner = " | " if group_logic == "OR" else " & "
        combined = group_joiner.join(group_exprs)

        flagvar = _truncvar(f"d2e_flag_chk006_r{ri}_", safe_dep)
        lines.append(f'* Skip rule #{ri + 1}: if {combined} → {safe_dep} must be missing')
        lines.append(f'gen {flagvar} = ({combined}) & !missing({safe_dep})')
        lines.append(f'label var {flagvar} "CHK-006: Skip logic for {safe_dep}"')
        lines.append(f'quietly count if {flagvar} == 1')
        lines.append(f'di as text "CHK-006 ({safe_dep}, rule {ri + 1}): " as result r(N) as text " flags"')
        lines.append('')

    return "\n".join(lines) + "\n"


def _emit_chk008(config: dict[str, Any], columns: list[str]) -> str:
    excluded = set(config.get("excluded_columns", []))
    # We can't know which columns are numeric from names alone, so we emit
    # a capture block that silently skips string columns.
    analysis_cols = [c for c in columns if c not in excluded]

    if not analysis_cols:
        return "* CHK-008: No columns to analyse\n\n"

    safe_cols = [_sanitize_stata_name(c) for c in analysis_cols]
    col_list = " ".join(safe_cols)

    lines = [
        '/*───────────────────────────────────────────────────',
        '  CHK-008: Outlier Z-score | Severity: Warning',
        '  Rule: |z-score| > threshold for numeric columns',
        '───────────────────────────────────────────────────*/',
        '',
        f'local _chk008_cols "{col_list}"',
        'foreach var of local _chk008_cols {',
        "    capture confirm numeric variable `var'",
        '    if _rc == 0 {',
        "        quietly summarize `var'",
        '        if r(sd) > 0 & r(sd) < . {',
        '            local _flagvar = substr("d2e_flag_chk008_" + "`var\'", 1, 32)',
        "            gen _d2e_z = (`var' - r(mean)) / r(sd)",
        "            gen `_flagvar' = (abs(_d2e_z) > `zscore_threshold') if !missing(`var')",
        '            label var `_flagvar\' "CHK-008: Outlier z-score for `var\'"',
        "            quietly count if `_flagvar' == 1",
        '            di as text "CHK-008 (`var\'): " as result r(N) as text " flags"',
        '            drop _d2e_z',
        '        }',
        '    }',
        '}',
        '',
    ]

    return "\n".join(lines) + "\n"


def _emit_chk010(config: dict[str, Any]) -> str:
    mode = config.get("duration_mode", "column")
    if mode == "none":
        return "* CHK-010: Duration mode is 'none' — skipped\n\n"

    lines = [
        '/*───────────────────────────────────────────────────',
        '  CHK-010: Interview Duration Anomaly | Severity: Warning/Critical',
        '  Subtypes: impossible, short, long, heaped',
        '───────────────────────────────────────────────────*/',
        '',
    ]

    # Resolve duration to minutes
    if mode == "start_end":
        lines.append('* Compute duration from start/end timestamps')
        lines.append('gen double _d2e_dur_minutes = (clock(`dur_end_col\', "YMDhms") - clock(`dur_start_col\', "YMDhms")) / 60000')
    else:
        # Column mode
        unit = config.get("duration_unit", "minutes")
        lines.append('* Use duration column directly')
        if unit == "seconds":
            lines.append('gen double _d2e_dur_minutes = `duration_col\' / 60')
        else:
            lines.append('gen double _d2e_dur_minutes = `duration_col\'')

    lines.extend([
        '',
        '* Subtypes are mutually exclusive (matching data2explore logic):',
        '* impossible > short > long > heaped (first match wins)',
        'gen d2e_flag_chk010_impossible = 0',
        'gen d2e_flag_chk010_short = 0',
        'gen d2e_flag_chk010_long = 0',
        'gen d2e_flag_chk010_heaped = 0',
        'label var d2e_flag_chk010_impossible "CHK-010: Impossible duration"',
        'label var d2e_flag_chk010_short "CHK-010: Unusually short duration"',
        'label var d2e_flag_chk010_long "CHK-010: Unusually long duration"',
        'label var d2e_flag_chk010_heaped "CHK-010: Heaped duration"',
        '',
        '* ── Impossible (non-positive) ──',
        'replace d2e_flag_chk010_impossible = 1 if _d2e_dur_minutes <= 0 & !missing(_d2e_dur_minutes)',
        '',
        '* ── Short / Long (relative to median, using MAD) ──',
        'quietly summarize _d2e_dur_minutes if _d2e_dur_minutes > 0, detail',
        'local _dur_median = r(p50)',
        'local _dur_n = r(N)',
        '',
        'if `_dur_n\' >= `dur_min_obs\' {',
        '    * Compute MAD (Median Absolute Deviation)',
        '    gen double _d2e_dur_dev = abs(_d2e_dur_minutes - `_dur_median\') if _d2e_dur_minutes > 0',
        '    quietly summarize _d2e_dur_dev, detail',
        '    local _dur_mad = r(p50)',
        '',
        '    if `_dur_mad\' > 0 {',
        '        local _dur_lower = `_dur_median\' - `dur_deviation\' * `_dur_mad\'',
        '        local _dur_upper = `_dur_median\' + `dur_deviation\' * `_dur_mad\'',
        '        * Only flag short/long for rows not already flagged as impossible',
        '        replace d2e_flag_chk010_short = 1 if _d2e_dur_minutes < `_dur_lower\' & _d2e_dur_minutes > 0 & !missing(_d2e_dur_minutes) & d2e_flag_chk010_impossible == 0',
        '        replace d2e_flag_chk010_long = 1 if _d2e_dur_minutes > `_dur_upper\' & _d2e_dur_minutes > 0 & !missing(_d2e_dur_minutes) & d2e_flag_chk010_impossible == 0',
        '    }',
        '    capture drop _d2e_dur_dev',
        '}',
        '',
        '* ── Heaped (only if not already flagged by another subtype) ──',
        'replace d2e_flag_chk010_heaped = 1 if mod(_d2e_dur_minutes, `heap_multiple\') == 0 & _d2e_dur_minutes <= `heap_ceiling\' & _d2e_dur_minutes > 0 & !missing(_d2e_dur_minutes) & d2e_flag_chk010_impossible == 0 & d2e_flag_chk010_short == 0 & d2e_flag_chk010_long == 0',
        '',
        'quietly count if d2e_flag_chk010_impossible == 1',
        'di as text "CHK-010 impossible: " as result r(N) as text " flags"',
        'quietly count if d2e_flag_chk010_short == 1',
        'di as text "CHK-010 short:      " as result r(N) as text " flags"',
        'quietly count if d2e_flag_chk010_long == 1',
        'di as text "CHK-010 long:       " as result r(N) as text " flags"',
        'quietly count if d2e_flag_chk010_heaped == 1',
        'di as text "CHK-010 heaped:     " as result r(N) as text " flags"',
        '',
        'drop _d2e_dur_minutes',
        '',
    ])

    return "\n".join(lines) + "\n"


def _emit_chk012(config: dict[str, Any]) -> str:
    rules: list[dict[str, Any]] = config.get("allowed_values_rules", [])
    if not rules:
        return "* CHK-012: No allowed-values rules configured — skipped\n\n"

    excluded = set(config.get("excluded_columns", []))

    lines = [
        '/*───────────────────────────────────────────────────',
        '  CHK-012: Allowed Values | Severity: Critical',
        '  Rule: Value not in the permitted set',
        '───────────────────────────────────────────────────*/',
        '',
    ]

    for rule in rules:
        col = rule.get("column", "")
        if not col or col in excluded:
            continue
        safe = _sanitize_stata_name(col)
        values = rule.get("values", [])
        if not values:
            continue

        # Determine if values are numeric-like
        all_numeric = all(_is_numeric_str(str(v)) for v in values)
        str_values = [str(v) for v in values]

        if all_numeric:
            inlist_expr = _stata_inlist(safe, str_values, is_string=False)
        else:
            inlist_expr = _stata_inlist(safe, str_values, is_string=True)

        flagvar = _truncvar("d2e_flag_chk012_", safe)
        lines.append(f'* Allowed values for {safe}: {", ".join(str_values[:10])}{"..." if len(str_values) > 10 else ""}')
        lines.append(f'gen {flagvar} = !({inlist_expr}) if !missing({safe})')
        lines.append(f'label var {flagvar} "CHK-012: Allowed values for {safe}"')
        lines.append(f'quietly count if {flagvar} == 1')
        lines.append(f'di as text "CHK-012 ({safe}): " as result r(N) as text " flags"')
        lines.append('')

    return "\n".join(lines) + "\n"


def _is_numeric_str(s: str) -> bool:
    """Check if a string can be parsed as a number."""
    try:
        float(s)
        return True
    except (ValueError, TypeError):
        return False


def _emit_chk009_comment() -> str:
    return """\
/*───────────────────────────────────────────────────
  CHK-009: Enumerator Anomaly Rate — SKIPPED

  This check computes per-enumerator total flag rates relative to the
  dataset average. It is a meta-check that aggregates flags from all
  other checks, making it difficult to replicate in a single-pass
  Stata script without running all checks first.

  To approximate this in Stata:
  1. Run this .do file to generate all d2e_flag_* variables
  2. Compute total flags per enumerator:
       egen _total_flags = rowtotal(d2e_flag_*)
       bysort `enumerator_col': egen _enum_flags = mean(_total_flags)
  3. Compare to the overall average and flag outliers.
───────────────────────────────────────────────────*/

"""


def _emit_csv_export(out_dir: str) -> str:
    # Normalize path
    stata_path = out_dir.replace("\\", "/")
    if not stata_path.endswith("/"):
        stata_path += "/"

    return f"""\
/*───────────────────────────────────────────────────
  Export flagged observations to CSV
───────────────────────────────────────────────────*/

* Collect all flag variables
quietly ds d2e_flag_*
local flag_vars `r(varlist)'

if "`flag_vars'" != "" {{
    * Count total flags per observation
    egen _d2e_total_flags = rowtotal(`flag_vars')

    * Export flagged rows
    preserve
    keep if _d2e_total_flags > 0
    keep `id_col' `enumerator_col' `flag_vars' _d2e_total_flags
    export delimited using "{stata_path}stata_flags.csv", replace
    restore

    quietly count if _d2e_total_flags > 0
    di as text _newline "Exported " as result r(N) as text " flagged observations to stata_flags.csv"
    drop _d2e_total_flags
}}
else {{
    di as text "No flag variables generated — nothing to export."
}}

"""


def _emit_footer() -> str:
    return """\
/*───────────────────────────────────────────────────
  Summary
───────────────────────────────────────────────────*/

di as text _newline "{hline 60}"
di as text "data2explore HFC replication complete."
di as text "Flag variables (d2e_flag_*) are available in the dataset."
di as text "Review the output above for flag counts per check."
di as text "{hline 60}"
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_CHECK_ORDER = [
    "CHK-001", "CHK-002", "CHK-004", "CHK-005", "CHK-006",
    "CHK-008", "CHK-010", "CHK-012", "CHK-009",
]


def generate_dofile(
    config: dict[str, Any],
    mapping: dict[str, str],
    run_id: str,
    dataset_path: str,
    out_path: Path,
    selected_check_ids: list[str] | None = None,
    columns: list[str] | None = None,
) -> Path:
    """Generate a Stata .do file that replicates the HFC checks.

    Parameters
    ----------
    config : dict
        Merged config (defaults + user overrides).
    mapping : dict
        Logical-to-physical column mapping (id, enumerator_id, survey_date).
    run_id : str
        Unique run identifier (embedded in header).
    dataset_path : str
        Path to the .dta file (baked into the ``use`` command).
    out_path : Path
        Where to write the generated .do file.
    selected_check_ids : list[str] | None
        Which checks to include. None = all.
    columns : list[str] | None
        Actual DataFrame column names (needed for CHK-002, CHK-008 column iteration).

    Returns
    -------
    Path
        The path where the .do file was written.
    """
    if columns is None:
        columns = []

    active_checks = set(selected_check_ids) if selected_check_ids else set(_CHECK_ORDER)
    out_dir = str(out_path.parent)

    sections: list[str] = []
    sections.append(_emit_header(run_id, dataset_path, config))
    sections.append(_emit_setup(dataset_path, config, mapping, columns))

    if "CHK-001" in active_checks:
        sections.append(_emit_chk001(mapping, config))
    if "CHK-002" in active_checks:
        sections.append(_emit_chk002(config, columns))
    if "CHK-004" in active_checks:
        sections.append(_emit_chk004(mapping, config, columns))
    if "CHK-005" in active_checks:
        sections.append(_emit_chk005(config))
    if "CHK-006" in active_checks:
        sections.append(_emit_chk006(config))
    if "CHK-008" in active_checks:
        sections.append(_emit_chk008(config, columns))
    if "CHK-010" in active_checks:
        sections.append(_emit_chk010(config))
    if "CHK-012" in active_checks:
        sections.append(_emit_chk012(config))

    # CHK-009 always emits just a comment, whether active or not
    if "CHK-009" in active_checks:
        sections.append(_emit_chk009_comment())

    sections.append(_emit_csv_export(out_dir))
    sections.append(_emit_footer())

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(sections), encoding="utf-8")
    return out_path
