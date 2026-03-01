# Plan: Option A — Field Supervisor Experience

> Self-contained implementation plan for data2explore.
> Designed to be executed by an AI coding agent (Codex, Claude, etc.) or a human developer.
> Read CLAUDE.md and DECISIONS.md before starting.

## Goal

Make data2explore a daily-use operational tool for field supervisors — not just a "run once and look" tool. Four features, in order:

1. **Enumerator & date filters on results**
2. **Delta view in UI (new/resolved/persisting since last run)**
3. **Save/load check configuration**
4. **Quick CSV flag export grouped by enumerator**

---

## Current State (read these files first)

| File | Purpose |
|------|---------|
| `app/src/App.tsx` (277 lines) | Main component, all state, orchestrates wizard steps |
| `app/src/components/ResultsStep.tsx` (258 lines) | Results display — profile, summary stats, flags table |
| `shared/index.ts` (79 lines) | All TypeScript interfaces (FlagRow, CheckOutput, etc.) |
| `engine/d2e_engine/output.py` (99 lines) | Delta logic, flag serialization |
| `engine/d2e_engine/checks/base.py` (45 lines) | FlagRow dataclass (13 fields) |
| `app/electron/main.ts` (190 lines) | IPC handlers for engine, dialogs, temp files |
| `app/electron/preload.cts` (27 lines) | Context bridge API |
| `CLAUDE.md` | Project architecture overview |
| `DECISIONS.md` | Past architectural decisions with reasoning |

---

## Feature 1: Enumerator & Date Filters on Results

### What
Add filter controls above the flags table in ResultsStep so supervisors can narrow flags by enumerator and/or date range.

### Why
Field supervisors check one enumerator at a time. iehfc issue #70 requests this. Currently our UI shows all flags with only a severity filter.

### Implementation

#### 1a. Add filter state to ResultsStep.tsx

In `ResultsStep.tsx`, add two new state variables alongside the existing `severityFilter`:

```tsx
const [enumeratorFilter, setEnumeratorFilter] = useState<string>("all");
const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
```

#### 1b. Derive filter options from flags data

Compute the unique enumerator list and date range from `checkResult.flags`:

```tsx
const enumerators = useMemo(() => {
  if (!checkResult?.flags) return [];
  const ids = [...new Set(checkResult.flags.map(f => f.enumerator_id).filter(Boolean))];
  return ids.sort();
}, [checkResult]);
```

For dates, use `created_at` field (ISO string) on each flag. Extract the date portion (`created_at.slice(0, 10)`). Note: `created_at` is the flag creation time, but for date filtering to be truly useful it should reflect the `survey_date`. The `survey_date` column is mapped but not currently stored on FlagRow.

**Decision needed:** Either:
- (A) Filter on `created_at` date (simpler, already on FlagRow) — this is the run date, not the survey date
- (B) Add `survey_date` to FlagRow schema (more correct, larger change)

**Recommendation:** Go with (A) for now. Add a comment noting this filters by run date. Survey date filtering can be added later when FlagRow is extended.

#### 1c. Render filter controls

Add a filter bar between the summary cards and the flags table. Use simple `<select>` for enumerator and `<input type="date">` for date range. Style with Tailwind.

```
┌─────────────────────────────────────────────────┐
│ [Severity: All ▾]  [Enumerator: All ▾]          │
│ [From: ____]  [To: ____]  [Clear Filters]       │
└─────────────────────────────────────────────────┘
```

#### 1d. Apply filters to displayed flags

Update the existing filtering logic. Currently there's a `filteredFlags` derived value that filters by severity. Extend it:

```tsx
const filteredFlags = useMemo(() => {
  let flags = checkResult?.flags ?? [];
  if (severityFilter !== "all") {
    flags = flags.filter(f => f.severity === severityFilter);
  }
  if (enumeratorFilter !== "all") {
    flags = flags.filter(f => f.enumerator_id === enumeratorFilter);
  }
  if (dateRange.from) {
    flags = flags.filter(f => f.created_at >= dateRange.from);
  }
  if (dateRange.to) {
    flags = flags.filter(f => f.created_at <= dateRange.to + "T23:59:59");
  }
  return flags;
}, [checkResult, severityFilter, enumeratorFilter, dateRange]);
```

#### 1e. Show filtered count

Display "Showing X of Y flags" above the table so the supervisor knows filters are active.

### Files changed
- `app/src/components/ResultsStep.tsx` — add state, filter bar, filtered display

### Testing
- Load sample data (`samples/sample_survey.csv`), run checks, verify:
  - Enumerator dropdown populates with unique IDs
  - Selecting an enumerator shows only that enumerator's flags
  - Severity + enumerator filters compose correctly
  - "Clear Filters" resets all
  - Flag count updates

---

## Feature 2: Delta View in UI

### What
Show a comparison banner when prior flags exist: "12 new flags, 3 resolved, 45 persisting since last run."

### Why
Supervisors run checks daily. They need to see what changed, not re-review everything. Our engine already computes deltas (`output.py` → `build_summary_json` with `prior_flags`). The UI just doesn't surface it yet. iehfc has no concept of this.

### Current engine support
`build_summary_json()` in `engine/d2e_engine/output.py` already returns:
```python
{
  "new_flags_count": int,
  "resolved_flags_count": int,
  "persisting_flags_count": int
}
```
...when `prior_flags` is provided. The CLI accepts `--prior-flags <path>` on the `check` command.

### Implementation

#### 2a. Store previous run's flags path

In `App.tsx`, after a successful check run, store the output directory path:

```tsx
const [lastCheckOutDir, setLastCheckOutDir] = useState<string | null>(null);
```

After check succeeds, save: `setLastCheckOutDir(outDir)`.

On re-run (user clicks "Start Over" → runs again), pass the previous `lastCheckOutDir + "/flags.csv"` as `--prior-flags` to the check command.

#### 2b. Update handleRunAnalysis in App.tsx

When building the check command args, if `lastCheckOutDir` exists, add:
```ts
args.push("--prior-flags", lastCheckOutDir + "/flags.csv");
```

#### 2c. Extend CheckSummary interface

In `shared/index.ts`, add optional delta fields to `CheckSummary`:

```ts
export interface CheckSummary {
  run_id: string;
  total_flags: number;
  by_severity: Record<string, number>;
  by_check: Record<string, number>;
  skipped_checks: Array<{ check_id: string; reason: string }>;
  // Delta fields (present when prior flags were provided)
  new_flags_count?: number;
  resolved_flags_count?: number;
  persisting_flags_count?: number;
}
```

#### 2d. Render delta banner in ResultsStep

If `checkResult.summary.new_flags_count` is defined (not undefined), show a banner:

```
┌─────────────────────────────────────────────────────┐
│ ▲ 12 new flags  ▼ 3 resolved  ─ 45 persisting      │
│ Compared to previous run                            │
└─────────────────────────────────────────────────────┘
```

Use green for resolved, amber/red for new, gray for persisting. Place this above the summary cards.

#### 2e. Mark new flags in the table

Add a small "NEW" badge next to flags that are new since last run. This requires knowing which flags are new. Two approaches:

- **Simple:** Just show the banner counts (no per-flag marking). Ship this first.
- **Advanced:** The engine could tag each flag with `is_new: true`. This requires extending FlagRow — defer to a later iteration.

**Recommendation:** Ship the banner only (2d). Per-flag "NEW" badges are a follow-up.

### Files changed
- `app/src/App.tsx` — add `lastCheckOutDir` state, pass `--prior-flags` on re-run
- `shared/index.ts` — add optional delta fields to `CheckSummary`
- `app/src/components/ResultsStep.tsx` — render delta banner

### Testing
- Run checks once → note outDir
- Click "Start Over", re-import same file, run again
- Verify delta banner appears with correct counts
- First run: no banner (no prior flags)

---

## Feature 3: Save/Load Check Configuration

### What
Let users save their check configuration (mapping + range rules + any future settings) to a JSON file, and load it back on a future run.

### Why
Field teams run the same checks on new data exports daily/weekly. Re-configuring mapping and range rules every time is friction. iehfc issue #71 requests downloadable settings.

### Implementation

#### 3a. Define config file schema

Create a new interface in `shared/index.ts`:

```ts
export interface ProjectConfig {
  version: "1";
  mapping: MappingConfig;
  range_rules: RangeRule[];
}
```

Keep it simple. `version` field for forward compatibility.

#### 3b. Add IPC handlers for config save/load

In `app/electron/main.ts`, add two new IPC handlers:

```ts
ipcMain.handle("config:save", async (_event, config: ProjectConfig) => {
  const result = await dialog.showSaveDialog({
    title: "Save Configuration",
    defaultPath: "d2e-config.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.promises.writeFile(result.filePath, JSON.stringify(config, null, 2));
  return result.filePath;
});

ipcMain.handle("config:load", async () => {
  const result = await dialog.showOpenDialog({
    title: "Load Configuration",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const raw = await fs.promises.readFile(result.filePaths[0], "utf-8");
  return JSON.parse(raw);
});
```

#### 3c. Expose in preload

In `app/electron/preload.cts`, add:

```ts
saveConfig: (config: any) => ipcRenderer.invoke("config:save", config),
loadConfig: () => ipcRenderer.invoke("config:load"),
```

#### 3d. Add Save/Load buttons to UI

Two placement options:

- **Option A (recommended):** Add "Save Config" button on the **RulesStep** (after user has configured mapping + rules). Add "Load Config" button on the **MappingStep** (so user can skip manual mapping).
- **Option B:** Add both buttons to a toolbar/header visible on all steps.

Go with Option A. On MappingStep, add a "Load Config" link/button. When loaded:
1. Apply `config.mapping` to the mapping state
2. Apply `config.range_rules` to the rangeRules state
3. Skip to RulesStep (or stay on MappingStep for review)

On RulesStep, add a "Save Config" button. When clicked:
1. Build `ProjectConfig` from current mapping + rangeRules
2. Call `window.d2e.saveConfig(config)`

#### 3e. Validation on load

When loading a config:
- Check `version === "1"`
- Validate that mapped columns exist in the current dataset's profile (warn if not, don't block)
- Validate range rules reference existing numeric columns (warn if not, remove invalid rules)

### Files changed
- `shared/index.ts` — add `ProjectConfig` interface
- `app/electron/main.ts` — add `config:save` and `config:load` IPC handlers
- `app/electron/preload.cts` — expose `saveConfig` and `loadConfig`
- `app/src/components/MappingStep.tsx` — add "Load Config" button + load logic
- `app/src/components/RulesStep.tsx` — add "Save Config" button
- `app/src/App.tsx` — wire up config load to set mapping + rangeRules state

### Testing
- Configure mapping + range rules → Save Config → verify JSON file written
- Start Over → Import new file → Load Config → verify mapping and rules restored
- Load config with columns not in dataset → verify warning shown, invalid entries skipped

---

## Feature 4: Quick CSV Flag Export by Enumerator

### What
Add a "Export Flags (CSV)" button that exports the current (filtered) flags as a CSV file, grouped/sorted by enumerator.

### Why
Supervisors often need to hand a printout or spreadsheet to each enumerator showing their flags. The Excel report is comprehensive but heavy. A quick filtered CSV is faster.

### Implementation

#### 4a. Add CSV export logic in ResultsStep

This is a client-side operation (no engine call needed). Generate CSV from the filtered flags array:

```tsx
const exportFilteredCsv = async () => {
  const headers = [
    "enumerator_id", "id", "check_id", "check_name", "severity",
    "column_name", "observed_value", "message", "created_at"
  ];
  // Sort by enumerator_id first, then severity (critical first), then check_id
  const sorted = [...filteredFlags].sort((a, b) => {
    if (a.enumerator_id !== b.enumerator_id) return a.enumerator_id.localeCompare(b.enumerator_id);
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return a.check_id.localeCompare(b.check_id);
  });
  const rows = sorted.map(f => headers.map(h => csvEscape(f[h])));
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

  const savePath = await window.d2e.saveFile("flags-export.csv");
  if (!savePath) return;
  // Need a new IPC handler to write arbitrary text to a path
  await window.d2e.writeFile(savePath, csv);
};
```

#### 4b. Add writeFile IPC handler

In `app/electron/main.ts`:

```ts
ipcMain.handle("file:write", async (_event, filePath: string, content: string) => {
  await fs.promises.writeFile(filePath, content, "utf-8");
  return true;
});
```

In `app/electron/preload.cts`:

```ts
writeFile: (path: string, content: string) => ipcRenderer.invoke("file:write", path, content),
```

#### 4c. Add button to ResultsStep

Place an "Export Flags (CSV)" button next to the existing "Export Report" button. If filters are active, label it "Export Filtered Flags (CSV)" to make it clear.

#### 4d. CSV escape helper

Add a simple CSV escape utility (handle commas, quotes, newlines in values):

```tsx
function csvEscape(value: any): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
```

### Files changed
- `app/electron/main.ts` — add `file:write` IPC handler
- `app/electron/preload.cts` — expose `writeFile`
- `app/src/components/ResultsStep.tsx` — add CSV export button + logic

### Testing
- Run checks → click "Export Flags (CSV)" → verify CSV written
- Apply enumerator filter → export → verify only filtered flags in CSV
- Verify CSV is sorted by enumerator, then severity, then check_id
- Open CSV in Excel → verify no formatting issues with commas/quotes in values

---

## Implementation Order & Dependencies

```
Feature 1 (Filters)          ← no dependencies, start here
    ↓
Feature 4 (CSV Export)       ← uses filteredFlags from Feature 1
    ↓
Feature 2 (Delta View)       ← independent of 1/4, but benefits from filter context
    ↓
Feature 3 (Save/Load Config) ← independent, but last because it touches more files
```

Recommended order: **1 → 4 → 2 → 3**

Features 1 and 4 are tightly related (CSV export uses the filtered flags from Feature 1). Feature 2 and 3 are independent of each other and of 1/4.

---

## Style & Convention Notes

- **Tailwind CSS v4** via Vite plugin — no PostCSS config. Use utility classes directly.
- **No routing** — wizard stepper pattern. Steps are: import → mapping → rules → running → results.
- **Preload is `.cts`** (compiled to `.cjs`) — Electron ESM constraint.
- **IPC pattern:** `ipcMain.handle(channel, handler)` in main.ts, `ipcRenderer.invoke(channel, ...args)` in preload.
- **Engine subprocess:** `uv run python -m d2e_engine <cmd>` spawned in `engine/` cwd.
- **State lives in App.tsx** — no external state management. Props flow down to step components.
- **FlagRow has 13 fields** — don't add fields without updating both Python dataclass and TS interface.
- Log a new entry in `DECISIONS.md` for any architectural choice (numbering continues from 015).

---

## Acceptance Criteria

- [ ] Enumerator dropdown filter works on results page
- [ ] Date range filter works on results page
- [ ] Filters compose (severity + enumerator + date)
- [ ] "Showing X of Y flags" count visible when filters active
- [ ] Delta banner shows new/resolved/persisting on re-run
- [ ] No delta banner on first run
- [ ] Save Config writes valid JSON with mapping + range rules
- [ ] Load Config restores mapping + range rules and warns on column mismatches
- [ ] CSV export respects current filters
- [ ] CSV sorted by enumerator → severity → check_id
- [ ] All new IPC channels exposed via preload
- [ ] No regressions: existing workflow (import → map → rules → run → results → export) still works
