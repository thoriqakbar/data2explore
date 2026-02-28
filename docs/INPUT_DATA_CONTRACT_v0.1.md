# Input Data Contract v0.1

## 1) Supported Formats
- `.csv`
- `.xlsx`
- `.txt` (delimited text only: comma, tab, or pipe)
- `.dta` (Stata 14+)

## 2) Required Logical Fields
Each project must map these logical fields to dataset columns:
- `id`
- `enumerator_id`
- `survey_date`
- `module`

If any required field is not mapped, checks cannot run.

## 3) File Parsing Rules
### CSV
- Default delimiter: comma.
- Header row required.
- UTF-8 preferred; fallback to Latin-1 if UTF-8 fails.

### XLSX
- Default sheet: first non-empty sheet.
- User can choose another sheet.
- Header row required.

### TXT (Delimited)
- Allowed delimiters: comma, tab, pipe.
- Header row required.
- Free-form plain text is not supported.

### DTA
- Support target: Stata 14+ `.dta`.
- Variable names and labels are imported when available.

## 4) Type Expectations
- `survey_date`: parseable date or datetime.
- `id`, `enumerator_id`, `module`: treated as string keys unless user overrides.

## 5) Validation Behavior
Blocking errors (must fix before run):
- File unreadable or unsupported format.
- No header row detected.
- Required mapped column missing.
- `survey_date` cannot be parsed for all rows.

Warnings (run allowed):
- Partial date parse failures.
- Duplicate column names after normalization.
- Mixed types in mapped key fields.

## 6) Normalization Rules
- Trim leading/trailing whitespace in column names.
- Preserve original column names for export/audit.
- Internal comparisons may use normalized names, but outputs show original names.

## 7) Performance Baseline
- MVP target: normal workflows up to 500,000 rows on pilot hardware.
