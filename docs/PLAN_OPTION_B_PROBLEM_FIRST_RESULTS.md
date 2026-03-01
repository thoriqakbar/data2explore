# Plan: Option B — Problem-First Results Experience

> Follow-up UX plan for `data2explore`.
> This replaces the earlier enumerator-first direction as the next redesign target for the Results page.
> Context: the long raw flag list remains important, but the primary review flow should be organized by problem type/check rather than by enumerator or by record.

## Goal

Make the Results experience match how supervisors actually review HFC outputs:

1. Start from a particular problem type
2. See the affected records for that problem
3. Inspect the observed values and messages
4. Use enumerator as context for triage, not as the main container
5. Keep the full raw flag list available as a fallback/reference view

---

## Problem With Current UX

The current Results page is still awkward because it asks the user to mentally reorganize a mixed list of flags.

Even with filters and enumerator patterns, the user still has to do too much work to answer:

- "Show me the duration issues"
- "Show me the bad skip/missingness cases"
- "Show me the outlier records and their values"

The current UI trends toward:

- record -> see what problems happened
- or enumerator -> see what records were flagged

But the desired review flow is:

- problem/check -> affected records -> observed values

This is especially important for checks like:

- duration anomalies
- skip or missingness patterns
- range violations
- outliers

because those are usually reviewed as categories of operational issues.

---

## Product Direction

Keep the long raw all-flags table, but stop making it carry the whole workflow.

The Results page should become:

1. Run summary and KPI cards
2. Problem-first review sections
3. Raw all-flags table
4. Export actions

The problem-first sections should be the main review surface.

---

## Target Information Architecture

### Results page structure

1. **Run Summary**
   - total flags
   - critical / warning
   - rerun delta banner

2. **Problem Review**
   - one section per problem/check category
   - each section shows affected records and values

3. **All Flags**
   - existing raw long table
   - remains essential

4. **Exports**
   - report export
   - filtered CSV export

---

## Design Principle

The user should be able to answer this in one scan:

> "What kind of problem is this, and which records are affected?"

Instead of:

> "Which record is this, and what problem happened to it?"

That inversion is the main UX change.

---

## Proposed Problem Model

Use the existing `check_id` and `check_name` from `FlagRow`, but group them into review-friendly categories.

### Initial categories

- `Duration`
  - `CHK-010`
- `Missingness`
  - `CHK-002`
  - `CHK-004`
- `Outliers`
  - `CHK-008`
- `Range`
  - `CHK-005`
- `Duplicate / ID`
  - `CHK-001`
- `Enumerator Risk`
  - `CHK-009`
- `Other`
  - any future checks without an explicit category

### Important decision

This category mapping should live in the renderer first, not the engine.

Reason:

- fast to change
- presentation concern
- avoids expanding engine contracts too early

---

## Core UI Change

Replace the new enumerator-first detail area with a **Problem Review** area.

### Each problem section should show

- section title (`Duration`, `Missingness`, etc.)
- count of flags in that section
- count of affected records
- count of affected enumerators
- top enumerators in that problem category
- list of flagged records for that problem

### Record block within a problem section

For each affected record:

- `id`
- `enumerator_id`
- `module` if present
- `column_name`
- `observed_value`
- `message`
- `severity`

If multiple flags for the same record exist in the same problem category, they should be grouped together under that record.

This gives the user:

- the problem they are reviewing
- the exact records involved
- the values that triggered the issue

---

## Data Model For Renderer

Derive this from `checkResult.flags` in the renderer.

### Problem section shape

```ts
type ProblemSection = {
  key: string;
  label: string;
  total_flags: number;
  affected_records: number;
  affected_enumerators: number;
  top_enumerators: Array<{ enumerator_id: string; count: number }>;
  records: ProblemRecordGroup[];
};
```

### Record group shape

```ts
type ProblemRecordGroup = {
  id: string;
  enumerator_id: string;
  module: string;
  flags: FlagRow[];
};
```

### Aggregation rules

For each problem category:

- collect all matching flags
- group by `id`
- count unique `id` as `affected_records`
- count unique `enumerator_id` as `affected_enumerators`
- compute `top_enumerators`

Sort sections by:

1. critical flag count
2. total flag count
3. label

Sort records within a section by:

1. number of critical flags in the record
2. total flags in the record
3. record id

---

## Interaction Model

### Filters

The existing filters stay:

- severity
- enumerator
- date

But they should affect the Problem Review sections first, not only the raw table.

### Expected behavior

- If user chooses `critical`, the problem sections recompute from critical flags only
- If user chooses an enumerator, the problem sections show only that enumerator’s records
- If user uses date range, the problem sections reflect that filtered set

### Important decision

Filters are global for the entire Results page.

Reason:

- consistent mental model
- no separate filter state per section
- exports already follow the same pattern

---

## What To Remove Or De-emphasize

### Remove as the primary focus

- Enumerator-first detail as the main analysis area

### Keep but demote

- Enumerator pattern summary can exist later as supporting context, but it should not be the main first review surface

### Keep fully

- raw long all-flags table

The raw list remains important because users still need:

- exact full output
- backup view when sections feel too abstract
- export-aligned audit trail

---

## Visual Structure Recommendation

### Problem Review section layout

For each category:

```text
Duration
[18 flags] [12 records] [4 enumerators]
Top enumerators: E12 (8), E07 (5), E03 (3)

- Record 00481 | Enumerator E12 | duration_minutes = 2 | "Interview too short"
- Record 00914 | Enumerator E12 | duration_minutes = 0 | "Impossible duration"
- Record 01002 | Enumerator E07 | duration_minutes = 180 | "Interview too long"
```

This should read like a review worksheet, not like a database table dump.

### UI recommendation

Use stacked cards/sections instead of trying to make everything another dense table.

Reason:

- easier to scan by problem
- supports grouped record blocks
- avoids compressing important context into too many columns

---

## Implementation Plan

### Phase 1: Replace enumerator-detail analysis block with problem-first sections

In `app/src/components/ResultsStep.tsx`:

- keep existing summary, filters, exports, and raw all-flags table
- remove enumerator-first ranking/detail as the primary analysis surface
- add derived problem sections from the filtered flag set

### Phase 2: Build renderer-side aggregation helpers

Extract helper logic, either in:

- `app/src/components/ResultsStep.tsx`

or preferably:

- `app/src/components/results/problemReview.ts`

Responsibilities:

- map `check_id` to review category
- group flags into problem sections
- group records within each section
- compute top enumerators

### Phase 3: Add problem review UI components

Recommended component split:

- `app/src/components/ProblemReviewSection.tsx`
- `app/src/components/ProblemRecordCard.tsx`
- keep `ResultsStep.tsx` as coordinator

### Phase 4: Keep raw all-flags table below problem review

Do not remove the long list.

It should remain:

- scrollable
- filter-aware
- export-aligned

### Phase 5: Validate with sample data

Use `samples/sample_survey.csv` and sample mapping to confirm:

- duration flags land under `Duration`
- outlier flags land under `Outliers`
- missingness checks land under `Missingness`
- records show observed values and messages

---

## Public API / Type Changes

### No engine changes required in v1

This redesign should be built from existing:

- `checkResult.flags`
- `checkResult.summary`

### No shared types required yet

Keep the problem-section types renderer-local until the UX stabilizes.

---

## Acceptance Criteria

- The Results page has a problem-first review area above the raw all-flags table
- Users can inspect duration issues as a group without scanning unrelated flags
- Users can inspect outliers as a group without scanning unrelated flags
- Each problem section shows affected records and observed values
- Enumerator is shown as context on each record block
- Existing filters still work across the page
- Raw all-flags table remains visible and usable
- No engine contract changes are required for the first version

---

## Explicit Assumptions

- The long raw flag list is still essential and should remain in the product
- The main UX failure is the lack of problem-first organization, not lack of raw detail
- Enumerators matter, but as supporting context for a problem, not as the primary review container
- The first version should use renderer-only aggregation
- Categories derived from `check_id` are acceptable for the current check set
- Problem-first review is the next UX direction to continue tomorrow

---

## Suggested First Task For Tomorrow

Start by replacing the current enumerator-pattern/detail block with a renderer-derived `Problem Review` block in `ResultsStep.tsx`, while leaving the all-flags table untouched.

That gives the fastest proof of whether the new direction actually feels right in the UI.
