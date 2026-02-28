# Decision Log

Living document tracking key design decisions. Newest entries at the bottom.

---

## 001 — Wizard stepper UI (not client-side routing)

**Date:** 2026-02
**Context:** The app has a linear workflow: Import → Map → Profile → Summary → Results. We needed to decide between a router (React Router) and a simple stepper component.
**Decision:** Use an in-memory step index with a `WizardStepper` component. No URL routing.
**Reasoning:** The workflow is strictly linear, each step depends on the previous step's output. Routing would add complexity (guards, redirects, state hydration) with no benefit — there's nothing to deep-link to. A stepper keeps all state in React without serialization concerns.

---

## 002 — Tailwind CSS v4 via Vite plugin

**Date:** 2026-02
**Context:** Needed a styling approach for the desktop app UI.
**Decision:** Use Tailwind CSS v4 with `@tailwindcss/vite` plugin. No PostCSS config needed.
**Reasoning:** Tailwind v4 integrates directly as a Vite plugin, eliminating PostCSS setup. Utility-first CSS is fast for prototyping and avoids naming debates. v4's automatic content detection means zero config for purging.

---

## 003 — Preload compiled as CommonJS (.cts → .cjs)

**Date:** 2026-02
**Context:** Electron's preload scripts don't fully support ESM yet. The rest of the project uses ESM.
**Decision:** The preload script is authored as `.cts` and compiled to `.cjs`. It lives alongside the ESM main process code.
**Reasoning:** Electron's context bridge requires `nodeIntegration: false` and `contextIsolation: true`, which constrains preload to CommonJS. Using `.cts` lets us keep TypeScript while respecting Electron's loader constraints.

---

## 004 — Module field made optional in mapping

**Date:** 2026-02
**Context:** The mapping config originally required four fields: `id`, `enumerator_id`, `survey_date`, `module`. Real-world survey data is often split across files by module rather than having a module column.
**Decision:** Make `module` optional in the mapping schema. Only `id`, `enumerator_id`, and `survey_date` are required.
**Reasoning:** Requiring `module` would block users whose data doesn't have that column. Making it optional is more pragmatic — if present it's used, if absent the engine skips module-level grouping.

---

## 005 — System temp directory for mapping files

**Date:** 2026-02
**Context:** The mapping config JSON needs to be passed from the renderer (which builds it) to the Python engine (which reads it). Needed a place to write it.
**Decision:** Write mapping files to the OS temp directory (`os.tmpdir()`).
**Reasoning:** Temp dir is always writable, doesn't pollute the project, and is cleaned up by the OS. No need for a persistent config location yet since the app is stateless (see Decision 006).

---

## 006 — No persistence yet (stateless)

**Date:** 2026-02
**Context:** Should the app save projects, recent files, or run history?
**Decision:** Not yet. Each session is stateless — import a file, run checks, view results.
**Reasoning:** Persistence adds complexity (database, migration, error handling). The MVP validates the core workflow. Persistence is a future feature once the check engine is more mature.

---

## 007 — Module-per-check pattern with declarative metadata

**Date:** 2026-02
**Context:** Needed a structure for HFC checks that's easy to add new checks to and testable in isolation.
**Decision:** Each check is a standalone Python module (e.g. `chk001_duplicate_id.py`) exporting `CHECK_ID`, `CHECK_NAME`, `SEVERITY`, `REQUIRED_MAPPING_FIELDS`, and a `run(df, mapping, config, run_id)` function. The runner discovers checks from a static registry list.
**Reasoning:** Module-per-check keeps checks independent and testable. Declarative `REQUIRED_MAPPING_FIELDS` lets the runner gracefully skip checks when required mapping fields are missing, rather than failing the entire run. Static registry (vs. dynamic discovery) keeps the system predictable — new checks are added by importing the module and appending to `_CHECKS`.

---

## 008 — FlagRow dataclass as the universal flag schema

**Date:** 2026-02
**Context:** Checks produce flags that need to flow through CSV output, JSON output, Excel reports, and the UI. Needed a single schema.
**Decision:** `FlagRow` is a 13-field dataclass in `checks/base.py` with a fixed `FIELD_ORDER` tuple. All checks produce `FlagRow` instances. CSV, JSON, and Excel outputs all derive from the same objects.
**Reasoning:** One canonical shape avoids translation layers between output formats. The `FIELD_ORDER` tuple ensures CSV columns are always consistent. Default values (e.g. `status="Open"`, auto-timestamped `created_at`) reduce boilerplate in individual checks.

---

## 009 — Sibling directory for check output (`<input>.d2e-checks/`)

**Date:** 2026-02
**Context:** The `check` command produces multiple output files (flags.csv, flags.json, summary.json, run_metadata.json). Needed a convention for where to write them.
**Decision:** Output goes to a directory named `<input-path>.d2e-checks/` next to the input file. The `--out-dir` CLI flag controls the path.
**Reasoning:** Sibling-directory convention keeps outputs co-located with data (easy to find), avoids collisions between runs on different files, and mirrors the existing `*.d2e-profile.json` / `*.d2e-summary.json` naming pattern. The directory is gitignored via `*.d2e-checks/`.

---

## 010 — Report generation as a separate CLI subcommand

**Date:** 2026-02
**Context:** The Excel report needs data from multiple sources (profile, summary stats, check results, run metadata). Should report generation be part of `check` or standalone?
**Decision:** Separate `report` subcommand that takes a combined JSON blob (`--data`) and produces an `.xlsx` file (`--out`). The renderer assembles the JSON from its in-memory state and invokes `report` independently.
**Reasoning:** Decoupling report from check execution means (1) the renderer controls what goes into the report, (2) reports can be regenerated without re-running checks, and (3) the `check` command stays focused on flag production. The 4-sheet workbook structure (Summary, Flags, Action Sheet with editable Status/Note columns, Data Overview) maps to the HFC report template in `docs/`.

---

## 011 — Two-phase run: summarize then check

**Date:** 2026-02
**Context:** The "Run" button originally only ran `summarize`. Now that checks exist, should they run separately or together?
**Decision:** Single "Run" button triggers a two-phase pipeline: `summarize` first, then `check`. Both use the same mapping file. If checks fail, results still display with summary data (non-fatal fallback).
**Reasoning:** Users expect one click to get all results. Running checks as a separate manual step would add friction. The non-fatal fallback ensures partial results are always shown — if check execution fails (e.g. engine error), the user still gets their summary statistics rather than losing everything.

---

## 012 — Delta comparison via flag key identity

**Date:** 2026-02
**Context:** Needed to show new/resolved/persisting flags between consecutive runs to help supervisors track progress.
**Decision:** A flag is uniquely identified by the tuple `(id, check_id, column_name)`. The `--prior-flags` CLI option loads a previous `flags.csv` and computes set differences against the current run.
**Reasoning:** The three-tuple captures "which observation, which check, which column" — enough to detect whether the same issue persists. Using set operations (current − prior = new, prior − current = resolved, intersection = persisting) is simple and correct for the MVP. Richer delta logic (e.g. tracking value changes) can be layered on later.
