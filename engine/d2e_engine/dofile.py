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

    lines = [
        "clear all",
        "set more off",
        "",
        '* ── Data ──────────────────────────────────────────',
        f'use "{stata_path}", clear',
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
───────────────────────────────────────────────────*/

duplicates tag `id_col', gen(_d2e_chk001_dup)
gen d2e_flag_chk001 = (_d2e_chk001_dup > 0) if !missing(`id_col')
label var d2e_flag_chk001 "CHK-001: Duplicate ID"
drop _d2e_chk001_dup

di as text "CHK-001: " as result "`=sum(d2e_flag_chk001)'" as text " flags"

"""


def _emit_chk002(config: dict[str, Any], columns: list[str]) -> str:
    excluded = set(config.get("excluded_columns", []))
    analysis_cols = [c for c in columns if c not in excluded]

    if not analysis_cols:
        return "* CHK-002: No columns to analyse (all excluded)\n\n"

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
    ]

    for col in analysis_cols:
        safe = _sanitize_stata_name(col)
        lines.append(f'quietly count if missing({safe})')
        lines.append(f'local _miss_{safe} = r(N)')
        lines.append(f'local _rate_{safe} = r(N) / _N')
        lines.append(f'if `_rate_{safe}\' > `miss_crit_threshold\' {{')
        lines.append(f'    di as text %30s "{safe}" _col(35) as result %10.0f `_miss_{safe}\' _col(48) as result %10.3f `_rate_{safe}\' _col(60) as error "CRITICAL"')
        lines.append(f'}}')
        lines.append(f'else if `_rate_{safe}\' > `miss_warn_threshold\' {{')
        lines.append(f'    di as text %30s "{safe}" _col(35) as result %10.0f `_miss_{safe}\' _col(48) as result %10.3f `_rate_{safe}\' _col(60) as error "WARNING"')
        lines.append(f'}}')
        lines.append('')

    lines.append('di as text "{hline 60}"')
    lines.append('')

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

    lines = [
        '/*───────────────────────────────────────────────────',
        '  CHK-004: Missingness by Enumerator | Severity: Warning',
        '  Rule: Enumerator missing rate > deviation_factor * baseline',
        '───────────────────────────────────────────────────*/',
        '',
        'di as text _newline "CHK-004: Missingness by Enumerator"',
        '',
        'tempvar _chk004_flag',
        'gen `_chk004_flag\' = 0',
        '',
    ]

    for col in analysis_cols:
        lines.append(f'* — Check column: {col}')
        lines.append(f'quietly count if missing({col})')
        lines.append(f'local _base_miss_{col} = r(N) / _N')
        lines.append(f'if `_base_miss_{col}\' >= 0.01 {{')
        lines.append(f'    bysort `enumerator_col\': egen _d2e_emiss_{col} = mean(missing({col}))')
        lines.append(f'    bysort `enumerator_col\': gen _d2e_ecount_{col} = _N if _n == 1')
        lines.append(f'    replace `_chk004_flag\' = 1 if _d2e_emiss_{col} > `_base_miss_{col}\' * `enum_deviation\' & _d2e_ecount_{col} >= `enum_min_rows\'')
        lines.append(f'    drop _d2e_emiss_{col} _d2e_ecount_{col}')
        lines.append(f'}}')
        lines.append('')

    lines.append('gen d2e_flag_chk004 = `_chk004_flag\'')
    lines.append('label var d2e_flag_chk004 "CHK-004: Missingness by Enumerator"')
    lines.append('drop `_chk004_flag\'')
    lines.append('')
    lines.append('di as text "CHK-004: " as result "`=sum(d2e_flag_chk004)\'" as text " flags"')
    lines.append('')

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

        lines.append(f'* Range rule: {safe} {" and ".join(label_parts)}')
        lines.append(f'gen d2e_flag_chk005_{safe} = ({condition}) if !missing({safe})')
        range_label = f"[{rule_min if rule_min is not None else '.'}, {rule_max if rule_max is not None else '.'}]"
        lines.append(f'label var d2e_flag_chk005_{safe} "CHK-005: Range {range_label} for {safe}"')
        lines.append(f'di as text "CHK-005 ({safe}): " as result "`=sum(d2e_flag_chk005_{safe})\'" as text " flags"')
        lines.append('')

    return "\n".join(lines) + "\n"


def _emit_chk008(config: dict[str, Any], columns: list[str]) -> str:
    excluded = set(config.get("excluded_columns", []))
    # We can't know which columns are numeric from names alone, so we emit
    # a capture block that silently skips string columns.
    analysis_cols = [c for c in columns if c not in excluded]

    if not analysis_cols:
        return "* CHK-008: No columns to analyse\n\n"

    lines = [
        '/*───────────────────────────────────────────────────',
        '  CHK-008: Outlier Z-score | Severity: Warning',
        '  Rule: |z-score| > threshold for numeric columns',
        '───────────────────────────────────────────────────*/',
        '',
    ]

    for col in analysis_cols:
        safe = _sanitize_stata_name(col)
        lines.append(f'capture confirm numeric variable {safe}')
        lines.append(f'if _rc == 0 {{')
        lines.append(f'    quietly summarize {safe}')
        lines.append(f'    if r(sd) > 0 & r(sd) < . {{')
        lines.append(f'        gen _d2e_z_{safe} = ({safe} - r(mean)) / r(sd)')
        lines.append(f'        gen d2e_flag_chk008_{safe} = (abs(_d2e_z_{safe}) > `zscore_threshold\') if !missing({safe})')
        lines.append(f'        label var d2e_flag_chk008_{safe} "CHK-008: Outlier z-score for {safe}"')
        lines.append(f'        di as text "CHK-008 ({safe}): " as result "`=sum(d2e_flag_chk008_{safe})\'" as text " flags"')
        lines.append(f'        drop _d2e_z_{safe}')
        lines.append(f'    }}')
        lines.append(f'}}')
        lines.append('')

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
        '* ── Impossible (non-positive) ──',
        'gen d2e_flag_chk010_impossible = (_d2e_dur_minutes <= 0) if !missing(_d2e_dur_minutes)',
        'label var d2e_flag_chk010_impossible "CHK-010: Impossible duration"',
        '',
        '* ── Short / Long (relative to median, using MAD) ──',
        'quietly summarize _d2e_dur_minutes if _d2e_dur_minutes > 0, detail',
        'local _dur_median = r(p50)',
        'local _dur_n = r(N)',
        '',
        'gen d2e_flag_chk010_short = 0',
        'gen d2e_flag_chk010_long = 0',
        'label var d2e_flag_chk010_short "CHK-010: Unusually short duration"',
        'label var d2e_flag_chk010_long "CHK-010: Unusually long duration"',
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
        '        replace d2e_flag_chk010_short = (_d2e_dur_minutes < `_dur_lower\') if _d2e_dur_minutes > 0 & !missing(_d2e_dur_minutes)',
        '        replace d2e_flag_chk010_long = (_d2e_dur_minutes > `_dur_upper\') if _d2e_dur_minutes > 0 & !missing(_d2e_dur_minutes)',
        '    }',
        '    capture drop _d2e_dur_dev',
        '}',
        '',
        '* ── Heaped (multiples of heaping_multiple, up to ceiling) ──',
        'gen d2e_flag_chk010_heaped = (mod(_d2e_dur_minutes, `heap_multiple\') == 0 & _d2e_dur_minutes <= `heap_ceiling\' & _d2e_dur_minutes > 0) if !missing(_d2e_dur_minutes)',
        'label var d2e_flag_chk010_heaped "CHK-010: Heaped duration"',
        '',
        'di as text "CHK-010 impossible: " as result "`=sum(d2e_flag_chk010_impossible)\'" as text " flags"',
        'di as text "CHK-010 short:      " as result "`=sum(d2e_flag_chk010_short)\'" as text " flags"',
        'di as text "CHK-010 long:       " as result "`=sum(d2e_flag_chk010_long)\'" as text " flags"',
        'di as text "CHK-010 heaped:     " as result "`=sum(d2e_flag_chk010_heaped)\'" as text " flags"',
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

        lines.append(f'* Allowed values for {safe}: {", ".join(str_values[:10])}{"..." if len(str_values) > 10 else ""}')
        lines.append(f'gen d2e_flag_chk012_{safe} = !({inlist_expr}) if !missing({safe})')
        lines.append(f'label var d2e_flag_chk012_{safe} "CHK-012: Allowed values for {safe}"')
        lines.append(f'di as text "CHK-012 ({safe}): " as result "`=sum(d2e_flag_chk012_{safe})\'" as text " flags"')
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

    di as text _newline "Exported " as result "`=sum(_d2e_total_flags > 0)'" as text " flagged observations to stata_flags.csv"
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
    "CHK-001", "CHK-002", "CHK-004", "CHK-005",
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
        Logical-to-physical column mapping (id, enumerator_id, survey_date, module).
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
