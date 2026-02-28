# Check Catalog (Core 11 + Optional Modules) v0.1

Each check defines: purpose, minimum columns, logic, default severity, and edge behavior.

## 1) Duplicate ID / Record
- Columns: `id`
- Logic: flag repeated `id` values.
- Severity: `Critical`
- Edge behavior: empty `id` rows flagged separately as missingness.

## 2) Missingness by Variable
- Columns: any variable
- Logic: compute missing rate per variable.
- Severity: `Warning` (or `Critical` if threshold exceeded)
- Edge behavior: threshold configurable by project.

## 3) Missingness by Module
- Columns: `module`, target variables
- Logic: missing rates grouped by module.
- Severity: `Warning`

## 4) Missingness by Enumerator
- Columns: `enumerator_id`, target variables
- Logic: compare enumerator-specific missingness against project baseline.
- Severity: `Warning` or `Critical` for strong deviation.

## 5) Range Checks
- Columns: variable + dictionary/rule bounds
- Logic: values outside allowed min/max or allowed categories.
- Severity: `Critical`
- Edge behavior: if no dictionary rule exists, check is skipped for that variable.

## 6) Skip Logic Consistency
- Columns: trigger and dependent variables
- Logic: dependent answer must be empty/present according to skip condition.
- Severity: `Critical`

## 7) Cross-Variable Consistency
- Columns: rule-defined variable sets
- Logic: logical contradictions across related fields (for example age/school level mismatch rules).
- Severity: `Warning` or `Critical` by rule.

## 8) Outlier (Z-score)
- Columns: numeric variables
- Logic: absolute z-score above threshold.
- Severity: `Warning`
- Default threshold: `|z| > 3`
- Edge behavior: disabled for near-zero variance variables.

## 9) Enumerator Anomaly Rate
- Columns: `enumerator_id`, flag counts
- Logic: enumerators with unusually high share of problematic records.
- Severity: `Warning`

## 10) Interview Duration Anomaly
- Columns: start/end time or duration field
- Logic: extremely short/long durations by module or survey type.
- Severity: `Warning` (`Critical` if impossible duration)

## 11) New Flags Since Last Run
- Columns: stable row key (`id`) + flag signature
- Logic: flags newly introduced compared with previous run in same project.
- Severity: inherited from originating check.

## Optional-Field Auto-Disable
Checks requiring unavailable columns are marked `Skipped` with reason, not failed.

## Optional Modules (Not Core v0.1)
### GPS Plausibility
- Columns: latitude/longitude (and optional site boundaries)
- Logic: invalid coordinates, impossible jumps, or out-of-area points.
- Reason optional: many projects do not collect reliable GPS fields.
