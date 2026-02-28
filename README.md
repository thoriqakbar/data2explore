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

## Next implementation targets
1. Connect renderer UI flows to import/mapping/summarize end-to-end.
2. Add SQLite persistence for projects/datasets/runs.
3. Add report/artifact export pipeline from specs in `docs/`.
