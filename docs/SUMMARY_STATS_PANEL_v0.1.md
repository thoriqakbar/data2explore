# Summary Statistics Panel Spec v0.1

## Purpose
Provide a quick numeric overview so users can interpret flags with context.

## Scope
- Show statistics for numeric variables only.
- Keep output intentionally simple for non-technical users.

## Columns in Panel
- `variable`
- `obs`
- `mean`
- `std dev`
- `min`
- `max`

## Behavior
- Values are computed on the currently selected dataset/run.
- If a variable has no valid numeric observations, show `obs = 0` and blank stats.
- Panel supports basic sorting by any column.

## Out of Scope (v0.1)
- Percentiles
- Histograms
- Grouped summary tables
- Categorical frequency tables
