# Severity and Triage Spec v0.1

## 1) Severity Levels
## Critical
Use when issue can invalidate analysis or indicates likely data corruption.
Examples:
- Duplicate `id` conflicts.
- Hard range violations for protected variables.
- Skip-logic contradictions that imply impossible records.

## Warning
Use when issue is plausible but needs review.
Examples:
- High missingness pockets.
- Enumerator anomaly patterns.
- Outlier values.

## Info
Use for context or non-blocking diagnostics.
Examples:
- Mild distribution shifts.
- Small metadata inconsistencies.

## 2) Status Workflow
- `Open`: newly created or not reviewed.
- `Reviewed`: examined by user; decision recorded.
- `Resolved`: fixed in source data, accepted as valid, or explicitly waived.

Flags default to `Open`.

## 3) Required Actions
- Moving to `Reviewed` requires a short note.
- Moving to `Resolved` requires a resolution type:
  - `Corrected in source`
  - `Accepted as true value`
  - `Rule adjusted`
  - `Duplicate/merged`

## 4) Filtering and Prioritization
Default sort order:
1. Severity (`Critical` first)
2. New since last run
3. Highest impact group size

## 5) Auditability
Every status change records:
- timestamp
- user (local profile name)
- previous status
- new status
- note text
