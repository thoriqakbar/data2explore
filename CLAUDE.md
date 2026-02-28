# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

data2explore is a local-first desktop app (scaffold/MVP) for running high-frequency checks (HFC) on survey data. It detects data quality issues early in survey fieldwork. Privacy-first: no raw data leaves the machine.

## Tech Stack

- **Desktop**: Electron 34 + React 18 + TypeScript 5.7 + Vite 6
- **Engine**: Python 3.11+ CLI using pandas, openpyxl, pyreadstat
- **Package managers**: pnpm 10 (workspaces) for JS, uv for Python
- **Monorepo layout**: pnpm workspaces with `app` and `shared` packages

## Commands

```bash
# Install JS dependencies
pnpm install

# Start dev (Electron + Vite + tsc watcher concurrently)
pnpm dev

# Type-check both renderer and Electron main process
pnpm typecheck

# Build for production
pnpm build

# Run Python engine directly
pnpm engine:profile
pnpm engine:summarize

# Or manually from engine/:
cd engine && uv sync
uv run python -m d2e_engine profile --input ../samples/sample_survey.csv --out ../samples/profile_output.json
uv run python -m d2e_engine summarize --input ../samples/sample_survey.csv --mapping ../samples/sample_mapping.json --out ../samples/summary_output.json
```

## Architecture

### Two-process Electron app with Python subprocess

```
Renderer (React/Vite)  ──IPC──▶  Main (Electron/Node)  ──subprocess──▶  Python engine
   app/src/                        app/electron/                          engine/d2e_engine/
```

1. **Renderer** (`app/src/`): React UI calls `window.d2e.runEngine()` exposed via preload bridge
2. **Main process** (`app/electron/main.ts`): IPC handler `engine:run` spawns `uv run python -m d2e_engine <command>` as a child process in the `engine/` working directory
3. **Preload** (`app/electron/preload.ts`): Context bridge with `contextIsolation: true`, exposes `d2e.runEngine()`
4. **Python engine** (`engine/d2e_engine/`): Stateless CLI with two commands:
   - `profile` — schema profiling (row/col counts, dtypes, missingness)
   - `summarize` — summary statistics with mapping validation
5. **Shared types** (`shared/index.ts`): TypeScript types and JSON schemas used by both Electron and renderer

### Data flow

User action → React → IPC `engine:run` → Electron spawns `uv run python -m d2e_engine` → reads input file → writes JSON output → IPC resolves → React displays result

### Key files

- `app/electron/main.ts` — window creation, IPC handler that spawns Python
- `app/electron/preload.ts` — context bridge API
- `app/src/App.tsx` — main React component
- `engine/d2e_engine/__main__.py` — CLI entry point (argparse)
- `engine/d2e_engine/io.py` — multi-format data reader (csv, xlsx, txt, dta)
- `engine/d2e_engine/profile.py` — schema profiling logic
- `engine/d2e_engine/summarize.py` — summary statistics logic
- `shared/index.ts` — shared TypeScript types (MappingConfig, ProfileOutput, SummaryStatRow)
- `shared/schemas/` — JSON schema files for mapping, run metadata, summary stats
- `docs/` — product specs (HFC report template, check catalog, severity levels, etc.)
- `samples/` — sample CSV, mapping JSON, and example outputs for testing

### Input format support

CSV, XLSX (first non-empty sheet), TXT (comma/tab/pipe), DTA (Stata 14+). Format auto-resolved by file extension in `engine/d2e_engine/io.py`.

### Mapping config

Four required logical fields must be mapped to physical columns: `id`, `enumerator_id`, `survey_date`, `module`. Defined in `shared/schemas/mapping.schema.json`.

## Decision Log

See [`DECISIONS.md`](DECISIONS.md) for a running log of architectural and design decisions with reasoning. Read it at the start of each session to understand past choices before proposing changes.
