# Flag Decision Notes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up the existing `FlagDecision.note` and `FlagDecision.reason` fields to a modal dialog so users can document why they resolved flags.

**Architecture:** New `ResolveDialog` modal component. Resolve buttons throughout the UI open the dialog instead of calling the resolve handler directly. The handler signature gains `reason` and `note` params. No backend/type changes needed — all fields already exist.

**Tech Stack:** React 18, TypeScript, Tailwind CSS (existing stack)

---

### Task 1: Create ResolveDialog component

**Files:**
- Create: `app/src/components/ResolveDialog.tsx`

**Step 1: Write the ResolveDialog component**

```tsx
import { useState } from "react";
import type { FlagRow } from "../../../shared/index";

const REASON_OPTIONS = [
  { value: "accepted", label: "Accepted" },
  { value: "false_positive", label: "False Positive" },
  { value: "confirmed_with_supervisor", label: "Confirmed with Supervisor" },
  { value: "data_corrected", label: "Data Corrected" },
] as const;

interface Props {
  flags: FlagRow[];
  onConfirm: (reason: string, note: string) => void;
  onCancel: () => void;
}

export function ResolveDialog({ flags, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState("accepted");
  const [note, setNote] = useState("");

  const count = flags.length;
  const title = count === 1
    ? `Resolve flag for ${flags[0].id || flags[0].check_id}`
    : `Resolve ${count} flags`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>

        <label className="block text-sm text-gray-700">
          Reason
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            {REASON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-gray-700">
          Note
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (optional)..."
            rows={3}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason, note.trim())}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            Resolve
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd D:/Personal/funprojects/data2explore && pnpm typecheck`
Expected: No errors in ResolveDialog.tsx

**Step 3: Commit**

```bash
git add app/src/components/ResolveDialog.tsx
git commit -m "feat: add ResolveDialog modal component"
```

---

### Task 2: Update handleResolveFlags to accept reason and note

**Files:**
- Modify: `app/src/App.tsx:655-720`

**Step 1: Change handler signature and wire reason + note**

In `App.tsx`, change `handleResolveFlags` from:
```typescript
const handleResolveFlags = useCallback((flagsToResolve: FlagRow[]) => {
```
to:
```typescript
const handleResolveFlags = useCallback((flagsToResolve: FlagRow[], reason: string = "accepted", note: string = "") => {
```

And update the decision object (lines 668-675) from:
```typescript
newDecisions[key] = {
  status: "dismissed",
  reason: "accepted",
  note: "",
  observed_value_at_decision: flag.observed_value,
  decided_at: now,
  decided_by: "app",
};
```
to:
```typescript
newDecisions[key] = {
  status: "dismissed",
  reason,
  note,
  observed_value_at_decision: flag.observed_value,
  decided_at: now,
  decided_by: "app",
};
```

**Step 2: Verify TypeScript compiles**

Run: `cd D:/Personal/funprojects/data2explore && pnpm typecheck`
Expected: PASS (defaults keep all existing callsites compatible)

**Step 3: Commit**

```bash
git add app/src/App.tsx
git commit -m "feat: handleResolveFlags accepts reason and note params"
```

---

### Task 3: Wire ResolveDialog into ProblemRecordCard and ProblemReviewSection

**Files:**
- Modify: `app/src/components/ProblemRecordCard.tsx`
- Modify: `app/src/components/ProblemReviewSection.tsx`

**Step 1: Update ProblemRecordCard to open dialog**

Replace the current resolve button with dialog state management:

```tsx
import { useState } from "react";
import type { FlagRow } from "../../../shared/index";
import type { ProblemRecordGroup } from "./results/problemReview";
import { ResolveDialog } from "./ResolveDialog";

interface Props {
  group: ProblemRecordGroup;
  onResolveFlags?: (flags: FlagRow[], reason: string, note: string) => void;
}

export function ProblemRecordCard({ group, onResolveFlags }: Props) {
  const [resolvingFlag, setResolvingFlag] = useState<FlagRow | null>(null);

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {/* ... existing header unchanged ... */}
      <div className="divide-y divide-gray-100">
        {group.flags.map((flag, index) => (
          <div key={/* existing key */} className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[160px_110px_1fr] gap-3">
            {/* ... existing columns unchanged ... */}
            <div className="space-y-1">
              <p className="text-xs text-gray-700">{flag.message}</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">
                  Observed value: <span className="font-mono">{flag.observed_value || "\u2014"}</span>
                </p>
                {onResolveFlags && (
                  <button
                    onClick={() => setResolvingFlag(flag)}
                    className="px-2 py-0.5 text-[11px] font-medium rounded bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors flex-shrink-0"
                    title={`Resolve flag for record ${flag.id || "unknown"}`}
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {resolvingFlag && onResolveFlags && (
        <ResolveDialog
          flags={[resolvingFlag]}
          onConfirm={(reason, note) => {
            onResolveFlags([resolvingFlag], reason, note);
            setResolvingFlag(null);
          }}
          onCancel={() => setResolvingFlag(null)}
        />
      )}
    </div>
  );
}
```

**Step 2: Update ProblemReviewSection to open dialog for "Resolve All"**

Add dialog state for the bulk "Resolve All" button:

```tsx
import { useState } from "react";
import type { FlagRow } from "../../../shared/index";
import type { ProblemSection } from "./results/problemReview";
import { ProblemRecordCard } from "./ProblemRecordCard";
import { ResolveDialog } from "./ResolveDialog";

interface Props {
  section: ProblemSection;
  defaultExpanded?: boolean;
  onResolveFlags?: (flags: FlagRow[], reason: string, note: string) => void;
}

export function ProblemReviewSection({ section, defaultExpanded = false, onResolveFlags }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);
  const [resolvingAll, setResolvingAll] = useState(false);

  const allFlags = section.records.flatMap(r => r.flags);
  // ... existing visibleRecords logic ...

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* ... existing accordion header unchanged ... */}

      {expanded && (
        <div className="p-4 space-y-3 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* ... existing top enumerators ... */}
            {onResolveFlags && (
              <button
                onClick={() => setResolvingAll(true)}
                className="px-3 py-1 text-xs font-medium rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Resolve All ({section.total_flags})
              </button>
            )}
          </div>
          {/* ... existing records list ... */}
        </div>
      )}

      {resolvingAll && onResolveFlags && (
        <ResolveDialog
          flags={allFlags}
          onConfirm={(reason, note) => {
            onResolveFlags(allFlags, reason, note);
            setResolvingAll(false);
          }}
          onCancel={() => setResolvingAll(false)}
        />
      )}
    </div>
  );
}
```

**Step 3: Update prop types in DataQualityTab and ResultsStep**

In `DataQualityTab.tsx` (line 12) and `ResultsStep.tsx` (line 26), update the prop type:
```typescript
onResolveFlags?: (flags: FlagRow[], reason: string, note: string) => void;
```

**Step 4: Verify TypeScript compiles**

Run: `cd D:/Personal/funprojects/data2explore && pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add app/src/components/ProblemRecordCard.tsx app/src/components/ProblemReviewSection.tsx app/src/components/tabs/DataQualityTab.tsx app/src/components/ResultsStep.tsx
git commit -m "feat: wire ResolveDialog into resolve buttons"
```

---

### Task 4: Add note display (tooltip) in resolved flags table

**Files:**
- Modify: `app/src/components/tabs/DataQualityTab.tsx:189-234`

**Step 1: Add Reason and Note columns to the resolved flags table**

In the resolved flags table header (line 203), add before the empty action th:
```tsx
<th className="text-left py-2 px-3 font-medium text-slate-500 text-xs">Reason</th>
<th className="text-left py-2 px-3 font-medium text-slate-500 text-xs">Note</th>
```

In the table body row, add cells that look up the decision. Use the `decisions` prop with `flagKeyStr` to get the note. Add a helper or inline lookup:
```tsx
{(() => {
  const key = `${flag.id}|${flag.check_id}|${flag.column_name}`;
  const decision = decisions?.[key];
  return (
    <>
      <td className="py-2 px-3 text-xs text-slate-500">{decision?.reason || "\u2014"}</td>
      <td className="py-2 px-3 text-xs text-slate-500 max-w-[150px]">
        {decision?.note ? (
          <span className="flex items-center gap-1" title={decision.note}>
            <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <span className="truncate">{decision.note}</span>
          </span>
        ) : "\u2014"}
      </td>
    </>
  );
})()}
```

**Step 2: Verify TypeScript compiles**

Run: `cd D:/Personal/funprojects/data2explore && pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add app/src/components/tabs/DataQualityTab.tsx
git commit -m "feat: show reason and note in resolved flags table"
```

---

### Task 5: Add reason and note to CSV export

**Files:**
- Modify: `app/src/components/tabs/DataQualityTab.tsx:88-104`

**Step 1: Update the CSV export headers and row mapping**

Change the `exportFlagsCsv` function to include `reason` and `note` columns. These come from the `decisions` prop, keyed by the flag's composite key:

```typescript
const exportFlagsCsv = () => {
  if (!onExportFlags) return;
  const headers = [
    "run_id", "check_id", "check_name", "severity", "status",
    "id", "enumerator_id", "column_name", "observed_value",
    "rule_reference", "message", "created_at", "reason", "note",
  ];
  const sorted = [...filteredFlags].sort((a, b) =>
    a.enumerator_id.localeCompare(b.enumerator_id) ||
    ({ critical: 0, warning: 1 }[a.severity.toLowerCase()] ?? 2) - ({ critical: 0, warning: 1 }[b.severity.toLowerCase()] ?? 2) ||
    a.check_id.localeCompare(b.check_id)
  );
  onExportFlags([
    headers.join(","),
    ...sorted.map((flag) => {
      const key = `${flag.id}|${flag.check_id}|${flag.column_name}`;
      const decision = decisions?.[key];
      const row: Record<string, unknown> = { ...flag, reason: decision?.reason ?? "", note: decision?.note ?? "" };
      return headers.map((h) => csvEscape(row[h])).join(",");
    }),
  ].join("\n"));
};
```

**Step 2: Verify TypeScript compiles**

Run: `cd D:/Personal/funprojects/data2explore && pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add app/src/components/tabs/DataQualityTab.tsx
git commit -m "feat: include reason and note in CSV export"
```

---

### Task 6: Manual smoke test

**No files to change — verification only.**

**Step 1: Start the dev server**

Run: `cd D:/Personal/funprojects/data2explore && pnpm dev`

**Step 2: Test the resolve flow**

1. Load a dataset, run checks
2. Click "Resolve" on a single flag → modal appears with reason dropdown + note textarea
3. Select "False Positive", type "Test note", click Resolve
4. Verify undo toast appears
5. Expand "Show resolved" → verify reason and note display with tooltip
6. Click "Resolve All" on a section → same modal, shows count in title
7. Export CSV → verify `reason` and `note` columns are populated
8. Import the exported CSV back → verify notes round-trip

**Step 3: Final commit (if any fixes needed)**
