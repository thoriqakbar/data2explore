# Output and Reproducibility Spec v0.1

## 1) Output Artifacts per Run
- `hfc_report.pdf`: standardized HFC report for decision and follow-up workflows
- `flags.csv`: row-level check results
- `summary.json`: aggregate counts by check, severity, module, enumerator
- `summary_stats.csv`: simple numeric variable summary table
- `config.json`: full run config and thresholds
- `run_metadata.json`: run identity and version details
- `export_checks.do`: readable Stata script representation of applied checks

## 2) `flags.csv` Minimum Schema
- `run_id`
- `check_id`
- `check_name`
- `severity`
- `status`
- `id`
- `enumerator_id` (if available)
- `module` (if available)
- `column_name`
- `observed_value`
- `rule_reference`
- `message`
- `created_at`

## 3) Reproducibility Metadata
Each run must record:
- `run_id` (unique)
- dataset file path and file hash
- config hash
- check engine version
- app version
- timestamp

Rerun of same data + same config + same versions must produce identical summary and flag set ordering.

## 4) Stata `.do` Export Contract
- Human-readable sections by check.
- Deterministic command order.
- Comment headers include check id and threshold values.
- Uses preserved original column names where valid in Stata syntax.
- Export is traceable back to `run_id`.

## 5) New-Flags Delta Logic
- Compare current run flags against prior run in same project using:
  - stable key: `id + check_id + column_name + normalized_rule_signature`
- Tag results as:
  - `new`
  - `persisting`
  - `resolved_since_last_run`

`summary.json` must include:
- `new_flags_count`
- `persisting_flags_count`
- `resolved_since_last_run_count`
- `top_enumerator_impact` (top affected enumerators)
- `top_module_impact` (top affected modules)

## 6) Privacy Defaults
- No raw row upload to external services by default.
- Export files written locally under project workspace.

## 7) `summary_stats.csv` Minimum Schema
- `run_id`
- `variable`
- `obs`
- `mean`
- `std_dev`
- `min`
- `max`

Only numeric variables are included in v0.1 summary stats export.

## 8) `config.json` Required Defaults (v0.1)
- `outlier_method: "zscore"`
- `zscore_threshold: 3.0`
