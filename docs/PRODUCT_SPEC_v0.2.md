# data2explore Product Spec v0.2

## 1) Purpose
`data2explore` is a local-first desktop app for high-frequency checks (HFC) on survey data. It helps research and field teams detect data quality issues early, triage issues quickly, and rerun checks reproducibly.

## 2) Users
- Research Assistants: run daily/weekly checks.
- Field Managers: monitor enumerator/team performance.
- Data Leads and PIs: review severe issues and audit workflows.

## 3) MVP Goals
- Import survey datasets with minimal setup.
- Run deterministic, auditable quality checks.
- Track issue status from open to resolved.
- Export machine-readable outputs and Stata `.do` code.
- Preserve privacy by default (no raw data upload).

## 4) In Scope (v0.1)
- Desktop app for Windows.
- Input support: `.dta` (Stata 14+), `.xlsx`, `.csv`, delimited `.txt`.
- Core 11 deterministic checks (see check catalog).
- Optional modules defined but disabled by default (for example GPS plausibility).
- Severity levels: `Critical`, `Warning`, `Info`.
- Project reruns and "new flags since last run."
- Simple summary statistics panel per numeric variable (`obs`, `mean`, `std dev`, `min`, `max`).
- Outlier default: z-score with threshold `|z| > 3`.
- Stata export as readable `.do` script.
- Standardized HFC report export for field/supervisor workflows.

## 5) Out of Scope (v0.1)
- Autonomous AI-generated flags.
- Multi-tenant collaboration and cloud workspaces.
- Real-time co-editing.
- Advanced causal/inference diagnostics.

## 6) UX Flow
1. Create project.
2. Import dataset and optional dictionary.
3. Map required fields (`id`, `enumerator_id`, `survey_date`, `module`).
4. Run checks.
5. Review and filter flags.
6. Mark status and add notes.
7. Export results and reproducible artifacts.
8. Rerun on updated data and compare.

## 7) Success Criteria
- Time-to-first-report under 15 minutes for a new project.
- Consistent rerun outputs with identical inputs/config/version.
- Pilot users can complete setup without command line.

## 8) Product Principles
- Deterministic first: checks must be explainable.
- Local-first privacy: raw data stays on device by default.
- Reproducibility by design: every run records config and version metadata.
