# Survey Date Filter — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `survey_date` to FlagRow so the UI can filter flags by interview date instead of run timestamp.

**Architecture:** Add field to Python FlagRow dataclass + TypeScript interface. Row-level checks extract date from the dataframe row using the mapping. Aggregate/column-level checks leave it empty. UI date filter switches from `created_at` to `survey_date`.

**Tech Stack:** Python 3.11 (pandas, dataclasses), TypeScript, React

---

### Task 1: Add survey_date to Python FlagRow and build_flag_row

**Files:**
- Modify: `engine/d2e_engine/checks/base.py`

**Step 1: Add survey_date field and update FIELD_ORDER**

In `engine/d2e_engine/checks/base.py`, add `survey_date` field to the dataclass and FIELD_ORDER:

```python
@dataclass
class FlagRow:
    run_id: str
    check_id: str
    check_name: str
    severity: str
    status: str = "Open"
    id: str = ""
    enumerator_id: str = ""
    survey_date: str = ""          # <-- NEW
    column_name: str = ""
    observed_value: str = ""
    rule_reference: str = ""
    message: str = ""
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    FIELD_ORDER: tuple[str, ...] = (
        "run_id", "check_id", "check_name", "severity", "status",
        "id", "enumerator_id", "survey_date", "column_name",   # <-- NEW
        "observed_value", "rule_reference", "message", "created_at",
    )
```

`build_flag_row()` already handles any field in FIELD_ORDER (line 41: `elif key in FlagRow.FIELD_ORDER`), so no changes needed there.

**Step 2: Run existing tests to verify nothing breaks**

Run: `cd engine && uv run pytest -x -q`
Expected: All 96 tests pass (survey_date defaults to "" so all existing flags gain an empty field)

**Step 3: Commit**

```bash
git add engine/d2e_engine/checks/base.py
git commit -m "feat: add survey_date field to FlagRow dataclass"
```

---

### Task 2: Add survey_date extraction to row-level checks

**Files:**
- Modify: `engine/d2e_engine/checks/chk001_duplicate_id.py`
- Modify: `engine/d2e_engine/checks/chk005_range_check.py`
- Modify: `engine/d2e_engine/checks/chk008_outlier_zscore.py`
- Modify: `engine/d2e_engine/checks/chk010_duration_anomaly.py`
- Modify: `engine/d2e_engine/checks/chk012_allowed_values.py`

All 5 row-level checks follow the same pattern. For each, add extraction of survey_date from the row.

**Pattern:** Each check already reads `id_col = mapping.get("id", "")` and `enum_col = mapping.get("enumerator_id", "")`. Add:
```python
date_col = mapping.get("survey_date", "")
```

Then in each `build_flag_row()` call, add:
```python
survey_date=_fmt_date(row_data.get(date_col, "")) if date_col and date_col in df.columns else "",
```

We need a small helper to normalize date values to YYYY-MM-DD. Add to `base.py`:

```python
def fmt_survey_date(val: Any) -> str:
    """Best-effort format a date value as YYYY-MM-DD string."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    s = str(val).strip()
    if not s:
        return ""
    # Already YYYY-MM-DD?
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    # Try pandas parsing as fallback
    try:
        return pd.Timestamp(val).strftime("%Y-%m-%d")
    except Exception:
        return s
```

Import `pd` in base.py: `import pandas as pd`

**CHK-001** (`chk001_duplicate_id.py`): Already has `first_row = df.loc[df[id_col] == val].iloc[0]`. Add `date_col` extraction and pass `survey_date=fmt_survey_date(first_row.get(date_col, ""))` to build_flag_row.

**CHK-005** (`chk005_range_check.py`): Already has `row_data = df.loc[idx]`. Add `date_col` extraction and pass `survey_date=fmt_survey_date(row_data.get(date_col, ""))`.

**CHK-008** (`chk008_outlier_zscore.py`): Already has `row_data = df.loc[idx]`. Same pattern.

**CHK-010** (`chk010_duration_anomaly.py`): Already has `row_data = df.loc[idx]`. Same pattern.

**CHK-012** (`chk012_allowed_values.py`): Already has `row_data = df.loc[idx]`. Same pattern.

**Checks that do NOT change** (aggregate/column-level — no row context):
- CHK-002 (missingness by variable) — flags at column level
- CHK-004 (missingness by enumerator) — flags at enumerator level
- CHK-009 (enumerator anomaly rate) — flags at enumerator level

These leave survey_date as "" (the default).

**Step 2: Run tests**

Run: `cd engine && uv run pytest -x -q`
Expected: All pass. The conftest `simple_df` has a `"date"` column and `base_mapping` includes `"survey_date": "date"`, so flags from row-level checks will now have survey_date populated.

**Step 3: Commit**

```bash
git add engine/d2e_engine/checks/base.py engine/d2e_engine/checks/chk001_duplicate_id.py engine/d2e_engine/checks/chk005_range_check.py engine/d2e_engine/checks/chk008_outlier_zscore.py engine/d2e_engine/checks/chk010_duration_anomaly.py engine/d2e_engine/checks/chk012_allowed_values.py
git commit -m "feat: populate survey_date in row-level check flags"
```

---

### Task 3: Add test for survey_date population

**Files:**
- Modify: `engine/tests/test_chk001_duplicate_id.py`
- Modify: `engine/tests/test_chk005_range_check.py`
- Create: `engine/tests/test_survey_date.py`

**Step 1: Add survey_date assertion to existing CHK-001 test**

In `test_chk001_duplicate_id.py`, add to `test_single_duplicate`:
```python
assert flags[0].survey_date == "2025-01-01"  # date from first_row of dup R001
```

**Step 2: Create a focused test file for survey_date behavior**

```python
"""Tests for survey_date field population across checks."""

from __future__ import annotations

import pandas as pd
import pytest

from d2e_engine.checks.base import fmt_survey_date


class TestFmtSurveyDate:
    def test_yyyy_mm_dd_string(self):
        assert fmt_survey_date("2025-01-15") == "2025-01-15"

    def test_datetime_with_time(self):
        assert fmt_survey_date("2025-01-15T10:30:00") == "2025-01-15"

    def test_pandas_timestamp(self):
        assert fmt_survey_date(pd.Timestamp("2025-03-01")) == "2025-03-01"

    def test_none(self):
        assert fmt_survey_date(None) == ""

    def test_nan(self):
        assert fmt_survey_date(float("nan")) == ""

    def test_empty_string(self):
        assert fmt_survey_date("") == ""

    def test_unparseable_passthrough(self):
        assert fmt_survey_date("not-a-date") == "not-a-date"


class TestRowLevelChecksPopulateSurveyDate:
    """Verify that row-level checks include survey_date from the mapped column."""

    def test_chk005_range_check(self, base_mapping, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R1", "R2"],
            "enum_id": ["E1", "E1"],
            "date": ["2025-02-10", "2025-02-11"],
            "age": [200, 25],
        })
        config = {"range_rules": [{"column": "age", "min": 0, "max": 120}]}
        from d2e_engine.checks.chk005_range_check import run
        flags = run(df, base_mapping, config, fixed_run_id)
        assert len(flags) == 1
        assert flags[0].survey_date == "2025-02-10"

    def test_chk008_outlier(self, base_mapping, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": [f"R{i}" for i in range(20)],
            "enum_id": ["E1"] * 20,
            "date": ["2025-03-01"] * 19 + ["2025-03-02"],
            "income": [100] * 19 + [99999],
        })
        config = {"zscore_threshold": 3.0}
        from d2e_engine.checks.chk008_outlier_zscore import run
        flags = run(df, base_mapping, config, fixed_run_id)
        assert len(flags) >= 1
        assert flags[0].survey_date == "2025-03-02"


class TestAggregateLevelChecksEmptySurveyDate:
    """Verify that aggregate/column-level checks leave survey_date empty."""

    def test_chk002_missingness_variable(self, base_mapping, base_config, fixed_run_id):
        df = pd.DataFrame({
            "resp_id": ["R1", "R2", "R3"],
            "enum_id": ["E1", "E1", "E1"],
            "date": ["2025-01-01", "2025-01-02", "2025-01-03"],
            "col_a": [None, None, None],  # 100% missing -> flag
        })
        config = {**base_config, "missing_warning_threshold": 0.2, "missing_critical_threshold": 0.5}
        from d2e_engine.checks.chk002_missingness_variable import run
        flags = run(df, base_mapping, config, fixed_run_id)
        assert len(flags) >= 1
        assert all(f.survey_date == "" for f in flags)
```

**Step 3: Run tests**

Run: `cd engine && uv run pytest tests/test_survey_date.py -v`
Expected: All pass

Run: `cd engine && uv run pytest -x -q`
Expected: All pass (including existing tests)

**Step 4: Commit**

```bash
git add engine/tests/test_survey_date.py engine/tests/test_chk001_duplicate_id.py engine/tests/test_chk005_range_check.py
git commit -m "test: verify survey_date population in check flags"
```

---

### Task 4: Add survey_date to TypeScript FlagRow and update UI filter

**Files:**
- Modify: `shared/index.ts:52-65`
- Modify: `app/src/components/tabs/DataQualityTab.tsx`

**Step 1: Add survey_date to TypeScript FlagRow**

In `shared/index.ts`, add after `enumerator_id`:
```typescript
export interface FlagRow {
  run_id: string;
  check_id: string;
  check_name: string;
  severity: string;
  status: string;
  id: string;
  enumerator_id: string;
  survey_date: string;          // <-- NEW
  column_name: string;
  observed_value: string;
  rule_reference: string;
  message: string;
  created_at: string;
}
```

**Step 2: Switch date filter in DataQualityTab**

In `DataQualityTab.tsx`, change the date filter (currently lines 54-55) from:
```typescript
.filter((flag) => !dateRange.from || toRunDate(flag.created_at) >= dateRange.from)
.filter((flag) => !dateRange.to || toRunDate(flag.created_at) <= dateRange.to);
```
to:
```typescript
.filter((flag) => !flag.survey_date || !dateRange.from || flag.survey_date >= dateRange.from)
.filter((flag) => !flag.survey_date || !dateRange.to || flag.survey_date <= dateRange.to);
```

The `!flag.survey_date` check makes column/aggregate-level flags (empty survey_date) always pass the filter.

**Step 3: Update help text**

Change the help text (currently around line 327) from:
```
Date filter uses run timestamp from `created_at`.
```
to:
```
Date filter uses survey interview date. Flags without a date are always shown.
```

**Step 4: Update Excel report columns**

In `engine/d2e_engine/report.py`, add survey_date to the flag columns (lines 125-134):
```python
_FLAG_COLUMNS = [
    "check_id", "check_name", "severity", "status", "id", "enumerator_id",
    "survey_date", "column_name", "observed_value", "rule_reference", "message",
    "created_at",
]

_FLAG_HEADERS = [
    "Check ID", "Check Name", "Severity", "Status", "ID", "Enumerator",
    "Survey Date", "Column", "Value", "Rule", "Message", "Run Date",
]
```

**Step 5: Typecheck**

Run: `cd D:/Personal/funprojects/data2explore && pnpm typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add shared/index.ts app/src/components/tabs/DataQualityTab.tsx engine/d2e_engine/report.py
git commit -m "feat: switch date filter to survey_date, update TS types and Excel report"
```

---

### Task 5: Run full test suite and smoke test

**Step 1: Run Python tests**

Run: `cd engine && uv run pytest -x -q`
Expected: All tests pass

**Step 2: Run TypeScript typecheck**

Run: `cd D:/Personal/funprojects/data2explore && pnpm typecheck`
Expected: PASS

**Step 3: Manual smoke test**

1. `pnpm dev`
2. Load sample dataset, run checks
3. Verify date filter inputs filter by interview date
4. Verify column-level flags (CHK-002 missingness) are visible even with date filter active
5. Export CSV — verify `survey_date` column is present
6. Export Excel report — verify "Survey Date" column appears in Flags sheet
