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
