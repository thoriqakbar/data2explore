# data2explore (Scaffold)

Local-first desktop scaffold for high-frequency checks (HFC) on survey data.

## What exists now
- Electron + React + TypeScript app shell
- Python engine CLI (`profile`, `summarize`)
- Shared schema/type placeholders
- Sample data and mapping fixtures

## Prerequisites
- Node.js 20+
- pnpm 10+
- Python 3.11+
- uv (Python package manager)

## Run app (development)
```bash
pnpm install
pnpm dev
```

## Run engine commands
```bash
cd engine
uv sync
uv run python -m d2e_engine profile --input ../samples/sample_survey.csv --out ../samples/profile_output.json
uv run python -m d2e_engine summarize --input ../samples/sample_survey.csv --mapping ../samples/sample_mapping.json --out ../samples/summary_output.json
```

## Current pipeline
1. Import dataset and auto-run profile.
2. Review or load mapping config.
3. Review range rules and optionally save config.
4. Run summary analysis and HFC checks.
5. Review results with severity, enumerator, and run-date filters.
6. Compare against the previous run from the same app session.
7. Export the Excel report or a filtered flags CSV.

## Next implementation targets
1. Persist projects and run history beyond a single app session.
2. Add editable flag status and note workflow with audit history.
3. Close the remaining artifact gaps from `docs/OUTPUT_AND_REPRODUCIBILITY_v0.1.md` such as `summary_stats.csv`, persisted `config.json`, and Stata export.
