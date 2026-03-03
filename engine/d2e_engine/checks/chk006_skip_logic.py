"""CHK-006  Skip Logic — flag rows where a dependent column has a value despite
skip conditions being met (i.e., the dependent should be missing).

Rule model (condition groups with configurable group_logic):
  Each rule has one or more *condition groups* and a dependent column.
  Within a group, conditions are AND'd (all must match for the group to fire).
  Between groups, `group_logic` controls the combination:
    - "AND" (default): all groups must fire.
    - "OR": any group firing is sufficient.
  Within each condition, multiple values are OR'd (column in [v1, v2, ...]).
  If the combined result is true and the dependent column is NOT missing → flag.
"""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from d2e_engine.checks.base import FlagRow, build_flag_row, fmt_survey_date

logger = logging.getLogger(__name__)

CHECK_ID = "CHK-006"
CHECK_NAME = "Skip Logic"
SEVERITY = "Critical"
REQUIRED_MAPPING_FIELDS = ("id",)


def _build_group_mask(
    df: pd.DataFrame,
    conditions: list[dict[str, Any]],
    logic: str = "AND",
) -> pd.Series:
    """Build a combined mask for conditions within one group.

    Each condition checks ``column in values`` (OR within values).
    Conditions are combined with *logic* (AND or OR, default AND).
    """
    use_or = logic.upper() == "OR"
    group_mask = pd.Series(not use_or, index=df.index)  # True for AND, False for OR
    has_any = False
    for cond in conditions:
        col = cond.get("column", "")
        vals = cond.get("values", [])
        if not col or not vals or col not in df.columns:
            if not use_or:
                # AND mode: missing condition → False
                group_mask = group_mask & pd.Series(False, index=df.index)
            # OR mode: missing condition → skip (stays False)
            has_any = True
            continue
        allowed_set = set(str(v) for v in vals)
        mask = df[col].apply(lambda x, s=allowed_set: str(x) in s if pd.notna(x) else False)
        if use_or:
            group_mask = group_mask | mask
        else:
            group_mask = group_mask & mask
        has_any = True
    return group_mask if has_any else pd.Series(False, index=df.index)


def _build_rule_reference(rule: dict[str, Any]) -> str:
    """Human-readable description of the skip rule."""
    groups = rule.get("condition_groups", [])
    group_logic = rule.get("group_logic", "AND").upper()
    dependent = rule.get("dependent_column", "?")

    group_strs: list[str] = []
    for group in groups:
        conditions = group.get("conditions", [])
        inner_logic = group.get("logic", "AND").upper()
        parts: list[str] = []
        for cond in conditions:
            col = cond.get("column", "?")
            vals = cond.get("values", [])
            vals_display = ", ".join(str(v) for v in vals)
            parts.append(f"{col} in [{vals_display}]")
        if len(parts) > 1:
            group_strs.append(f"({f' {inner_logic} '.join(parts)})")
        elif parts:
            group_strs.append(parts[0])

    joiner = f" {group_logic} "
    return f"if {joiner.join(group_strs)} → {dependent} must be missing"


def run(
    df: pd.DataFrame,
    mapping: dict[str, str],
    config: dict[str, Any],
    run_id: str,
) -> list[FlagRow]:
    rules: list[dict[str, Any]] = config.get("skip_rules", [])
    if not rules:
        return []

    excluded: set[str] = set(config.get("excluded_columns", []))

    id_col = mapping.get("id", "")
    enum_col = mapping.get("enumerator_id", "")
    date_col = mapping.get("survey_date", "")

    flags: list[FlagRow] = []

    for rule in rules:
        groups: list[dict[str, Any]] = rule.get("condition_groups", [])
        group_logic: str = rule.get("group_logic", "AND").upper()
        dependent: str = rule.get("dependent_column", "")

        if not dependent or not groups:
            continue
        if dependent not in df.columns:
            logger.info("Skip-logic dependent '%s' not in data — skipping rule", dependent)
            continue
        if dependent in excluded:
            continue

        # Build group masks and combine with group_logic
        group_masks: list[pd.Series] = []
        for group in groups:
            conditions = group.get("conditions", [])
            if not conditions:
                continue
            group_logic_inner = group.get("logic", "AND")
            group_masks.append(_build_group_mask(df, conditions, group_logic_inner))

        if not group_masks:
            continue

        if group_logic == "OR":
            combined = group_masks[0]
            for gm in group_masks[1:]:
                combined = combined | gm
        else:  # AND (default)
            combined = group_masks[0]
            for gm in group_masks[1:]:
                combined = combined & gm

        # Dependent column is NOT missing → violation
        dependent_has_value = df[dependent].notna()
        violations = combined & dependent_has_value

        rule_ref = _build_rule_reference(rule)

        for idx in df.index[violations]:
            row_data = df.loc[idx]
            observed = str(row_data[dependent])
            flags.append(
                build_flag_row(
                    run_id=run_id,
                    check_id=CHECK_ID,
                    check_name=CHECK_NAME,
                    severity=SEVERITY,
                    id=row_data.get(id_col, "") if id_col and id_col in df.columns else "",
                    enumerator_id=row_data.get(enum_col, "") if enum_col and enum_col in df.columns else "",
                    survey_date=fmt_survey_date(row_data.get(date_col, "")) if date_col and date_col in df.columns else "",
                    column_name=dependent,
                    observed_value=observed,
                    rule_reference=rule_ref,
                    message=f"'{dependent}' has value '{observed}' but should be missing ({rule_ref})",
                )
            )

    return flags
