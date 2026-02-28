# HFC Report Template v0.1

This template defines the standard structure for `hfc_report.pdf`.

## 1) Cover and Run Metadata
- Project name
- Run datetime
- Dataset filename and hash
- Row/column count
- App version
- Engine version
- Config hash

## 2) Executive Summary
- Total flags by severity (`Critical`, `Warning`, `Info`)
- Top 5 checks by affected records
- New flags since previous run
- Immediate action points (3-5 bullets)

## 3) Data Overview
- Records by module
- Records by enumerator
- Completion status summary (if available)

## 4) Summary Statistics (Numeric Variables)
Use this exact table format:

`variable | obs | mean | std dev | min | max`

Notes:
- Numeric variables only.
- No percentiles, histograms, or category tables in v0.1.

## 5) Check Results Sections
Include one section per core check:
1. Duplicate ID / Record
2. Missingness by Variable
3. Missingness by Module
4. Missingness by Enumerator
5. Range Checks
6. Skip Logic Consistency
7. Cross-Variable Consistency
8. Outlier (Z-score, default `|z| > 3`)
9. Enumerator Anomaly Rate
10. Interview Duration Anomaly
11. New Flags Since Last Run

Each section must show:
- Rule description
- Threshold/config used
- Affected record count
- Top impacted enumerators/modules
- Up to 5 example flagged rows

## 6) Supervisor Action Sheet
Default view includes open items grouped by enumerator.

Columns:
- `id`
- `enumerator_id`
- `module`
- `variable`
- `observed_value`
- `check_name`
- `severity`
- `status`
- `note`

## 7) Backcheck and Verification (Optional)
Show only when verification data is provided:
- Mismatch rate
- Top mismatched variables
- Enumerator-level mismatch summary

## 8) Appendix
- Full rule list used in the run
- Skipped checks and reason
- Parse/type warnings encountered during ingest
