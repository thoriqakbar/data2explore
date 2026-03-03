"""Excel report generation for HFC check results.

Produces an N-sheet workbook:
  1. Summary   – run metadata, severity counts, flags-by-check
  2. Flags     – all flags with auto-filter and conditional formatting
  3. Action Sheet – all flags date-sorted, with editable Status/Note columns
  4…N-1. Per-enumerator sheets – one per enumerator with flags
  N. Data Overview – column details and summary statistics
"""

from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.worksheet import Worksheet


# ── Colour palette ──────────────────────────────────────────────────

_FILL_CRITICAL = PatternFill(start_color="FDE8E8", end_color="FDE8E8", fill_type="solid")
_FILL_WARNING = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
_FILL_HEADER = PatternFill(start_color="F3F4F6", end_color="F3F4F6", fill_type="solid")
_FONT_HEADER = Font(bold=True, size=10)
_FONT_TITLE = Font(bold=True, size=12)
_FONT_LABEL = Font(bold=True, size=10, color="6B7280")
_THIN_BORDER = Border(bottom=Side(style="thin", color="D1D5DB"))


def generate_report(data: dict, out_path: Path) -> Path:
    """Build the full Excel workbook and save to *out_path*."""
    wb = Workbook()

    decisions = data.get("decisions", {})
    active_flags = data.get("flags", [])
    suppressed_flags = data.get("suppressed_flags", [])

    # Sheet 1 is created automatically — rename it
    wb.active.title = "Summary"  # type: ignore[union-attr]
    _write_summary_sheet(wb, data)
    _write_flags_sheet(wb, active_flags)
    _write_action_sheet(wb, active_flags, suppressed_flags, decisions)
    _write_enumerator_sheets(wb, active_flags)
    _write_data_overview_sheet(wb, data)
    if decisions:
        _write_decision_log_sheet(wb, decisions)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(str(out_path))
    return out_path


# ── Sheet 1: Summary ────────────────────────────────────────────────

def _write_summary_sheet(wb: Workbook, data: dict) -> None:
    ws: Worksheet = wb["Summary"]

    meta = data.get("run_metadata", {})
    profile = data.get("profile", {})
    summary = data.get("check_summary", {})

    # Header block
    _kv_row(ws, 1, "Dataset", meta.get("dataset_path", "—"))
    _kv_row(ws, 2, "Run Date", meta.get("timestamp", "—"))
    _kv_row(ws, 3, "Rows", profile.get("row_count", "—"))
    _kv_row(ws, 4, "Columns", profile.get("column_count", "—"))
    _kv_row(ws, 5, "Engine Version", meta.get("engine_version", "—"))
    _kv_row(ws, 6, "Run ID", meta.get("run_id", summary.get("run_id", "—")))

    # Severity counts
    row = 8
    ws.cell(row=row, column=1, value="Severity Counts").font = _FONT_TITLE
    row += 1
    _header_row(ws, row, ["Severity", "Count"])
    row += 1
    by_sev = summary.get("by_severity", {})
    for sev in ("critical", "warning"):
        count = by_sev.get(sev, 0)
        label = sev.title()
        ws.cell(row=row, column=1, value=label)
        ws.cell(row=row, column=2, value=count)
        fill = _FILL_CRITICAL if sev == "critical" else _FILL_WARNING
        ws.cell(row=row, column=1).fill = fill
        ws.cell(row=row, column=2).fill = fill
        row += 1

    # Flags by check
    row += 1
    ws.cell(row=row, column=1, value="Flags by Check").font = _FONT_TITLE
    row += 1
    _header_row(ws, row, ["Check ID", "Check Name", "Count"])
    row += 1
    by_check = summary.get("by_check", {})
    # Build a check_id → check_name lookup from flags
    name_lookup: dict[str, str] = {}
    for f in data.get("flags", []):
        name_lookup.setdefault(f.get("check_id", ""), f.get("check_name", ""))
    for cid, cnt in sorted(by_check.items(), key=lambda x: -x[1]):
        ws.cell(row=row, column=1, value=cid)
        ws.cell(row=row, column=2, value=name_lookup.get(cid, ""))
        ws.cell(row=row, column=3, value=cnt)
        row += 1

    # Skipped checks
    skipped = summary.get("skipped_checks", [])
    if skipped:
        row += 1
        ws.cell(row=row, column=1, value="Skipped Checks").font = _FONT_TITLE
        row += 1
        _header_row(ws, row, ["Check ID", "Reason"])
        row += 1
        for s in skipped:
            ws.cell(row=row, column=1, value=s.get("check_id", ""))
            ws.cell(row=row, column=2, value=s.get("reason", ""))
            row += 1

    _autosize(ws, min_width=12)


# ── Sheet 2: Flags ──────────────────────────────────────────────────

_FLAG_COLUMNS = [
    "check_id", "check_name", "severity", "status", "id", "enumerator_id",
    "survey_date", "column_name", "observed_value", "rule_reference", "message",
    "created_at",
]

_FLAG_HEADERS = [
    "Check ID", "Check Name", "Severity", "Status", "ID", "Enumerator",
    "Survey Date", "Column", "Value", "Rule", "Message", "Run Date",
]


def _write_flags_sheet(wb: Workbook, flags: list[dict]) -> None:
    ws = wb.create_sheet("Flags")

    # Header row
    _header_row(ws, 1, _FLAG_HEADERS)
    ws.freeze_panes = "A2"

    for i, flag in enumerate(flags, start=2):
        for j, key in enumerate(_FLAG_COLUMNS, start=1):
            cell = ws.cell(row=i, column=j, value=flag.get(key, ""))
            # Conditional row fill by severity
            sev_lower = flag.get("severity", "").lower()
            if sev_lower == "critical":
                cell.fill = _FILL_CRITICAL
            elif sev_lower == "warning":
                cell.fill = _FILL_WARNING

    # Auto-filter over data range
    if flags:
        last_col = get_column_letter(len(_FLAG_HEADERS))
        ws.auto_filter.ref = f"A1:{last_col}{len(flags) + 1}"

    _autosize(ws)


# ── Sheet 3: Action Sheet ──────────────────────────────────────────

def _write_action_sheet(
    wb: Workbook,
    active_flags: list[dict],
    suppressed_flags: list[dict] | None = None,
    decisions: dict | None = None,
) -> None:
    """All flags (active + resolved) with Status/Note pre-filled from decisions."""
    ws = wb.create_sheet("Action Sheet")
    _populate_action_sheet(ws, active_flags, suppressed_flags, decisions)


def _populate_action_sheet(
    ws: Worksheet,
    flags: list[dict],
    suppressed_flags: list[dict] | None = None,
    decisions: dict | None = None,
) -> None:
    """Shared logic for Action Sheet and per-enumerator sheets.

    When *suppressed_flags* and *decisions* are provided (Action Sheet),
    the sheet includes ALL flags with Status/Note pre-filled from decisions.
    Per-enumerator sheets use the simple path (no suppressed flags).
    """
    headers = _FLAG_HEADERS + ["Note"]
    _header_row(ws, 1, headers)
    ws.freeze_panes = "A2"

    # Build combined list: active flags + suppressed flags
    all_flags = list(flags)
    if suppressed_flags:
        all_flags.extend(suppressed_flags)

    # Sort: created_at asc → enumerator_id → severity (critical first)
    sev_order = {"critical": 0, "warning": 1}
    sorted_flags = sorted(
        all_flags,
        key=lambda f: (
            f.get("created_at", ""),
            f.get("enumerator_id", ""),
            sev_order.get(f.get("severity", "").lower(), 9),
        ),
    )

    # Build decision lookup: flag_key → decision
    decisions = decisions or {}

    _FILL_RESOLVED = PatternFill(start_color="E8F5E9", end_color="E8F5E9", fill_type="solid")

    for i, flag in enumerate(sorted_flags, start=2):
        # Look up decision for this flag
        flag_key = f"{flag.get('id', '')}|{flag.get('check_id', '')}|{flag.get('column_name', '')}"
        decision = decisions.get(flag_key)
        is_resolved = decision and decision.get("status") == "dismissed"

        for j, key in enumerate(_FLAG_COLUMNS, start=1):
            value = flag.get(key, "")
            # Pre-fill Status column from decision
            if key == "status" and is_resolved:
                value = "Resolved"
            cell = ws.cell(row=i, column=j, value=value)

            if is_resolved:
                cell.fill = _FILL_RESOLVED
            else:
                sev_lower = flag.get("severity", "").lower()
                if sev_lower == "critical":
                    cell.fill = _FILL_CRITICAL
                elif sev_lower == "warning":
                    cell.fill = _FILL_WARNING

        # Note column: pre-fill from decision note, or blank
        note_value = decision.get("note", "") if decision else ""
        note_cell = ws.cell(row=i, column=len(_FLAG_COLUMNS) + 1, value=note_value)
        if is_resolved:
            note_cell.fill = _FILL_RESOLVED

    # Data validation dropdown for Status column (col 4 in _FLAG_COLUMNS)
    if sorted_flags:
        status_col = _FLAG_COLUMNS.index("status") + 1
        dv = DataValidation(
            type="list",
            formula1='"Open,Resolved,Needs Review"',
            allow_blank=True,
        )
        dv.prompt = "Pick a status"
        dv.promptTitle = "Status"
        last_row = len(sorted_flags) + 1
        col_letter = get_column_letter(status_col)
        dv.sqref = f"{col_letter}2:{col_letter}{last_row}"
        ws.add_data_validation(dv)

        last_col = get_column_letter(len(headers))
        ws.auto_filter.ref = f"A1:{last_col}{last_row}"

    _autosize(ws)


# ── Per-enumerator sheets ──────────────────────────────────────────

def _write_enumerator_sheets(wb: Workbook, flags: list[dict]) -> None:
    """Create one sheet per enumerator that has flags."""
    by_enum: dict[str, list[dict]] = {}
    for f in flags:
        eid = f.get("enumerator_id", "") or "(unknown)"
        by_enum.setdefault(eid, []).append(f)

    for eid in sorted(by_enum):
        # Excel sheet names max 31 chars, no special chars
        sheet_name = str(eid)[:31]
        ws = wb.create_sheet(sheet_name)
        _populate_action_sheet(ws, by_enum[eid])


# ── Data Overview ──────────────────────────────────────────────────

def _write_data_overview_sheet(wb: Workbook, data: dict) -> None:
    ws = wb.create_sheet("Data Overview")

    profile = data.get("profile", {})
    columns = profile.get("columns", [])

    # Column details table
    ws.cell(row=1, column=1, value="Column Details").font = _FONT_TITLE
    _header_row(ws, 2, ["Column", "Type", "Non-missing", "Missing"])
    for i, col in enumerate(columns, start=3):
        ws.cell(row=i, column=1, value=col.get("name", ""))
        ws.cell(row=i, column=2, value=col.get("dtype", ""))
        ws.cell(row=i, column=3, value=col.get("non_missing_count", ""))
        ws.cell(row=i, column=4, value=col.get("missing_count", ""))

    # Summary statistics table
    stats = data.get("summary_stats", [])
    start_row = len(columns) + 5
    ws.cell(row=start_row, column=1, value="Summary Statistics").font = _FONT_TITLE
    _header_row(ws, start_row + 1, ["Variable", "Obs", "Mean", "Std Dev", "Min", "Max"])
    for i, row in enumerate(stats, start=start_row + 2):
        ws.cell(row=i, column=1, value=row.get("variable", ""))
        ws.cell(row=i, column=2, value=row.get("obs", ""))
        for j, key in enumerate(["mean", "std_dev", "min", "max"], start=3):
            val = row.get(key)
            ws.cell(row=i, column=j, value=round(val, 4) if val is not None else "")

    _autosize(ws)


# ── Decision Log ──────────────────────────────────────────────────

def _write_decision_log_sheet(wb: Workbook, decisions: dict) -> None:
    """Audit trail of all decisions made (in-app or via CSV import)."""
    ws = wb.create_sheet("Decision Log")
    headers = ["Flag Key", "Status", "Reason", "Note", "Observed Value", "Decided At", "Decided By"]
    _header_row(ws, 1, headers)
    ws.freeze_panes = "A2"

    sorted_keys = sorted(decisions.keys())
    for i, key in enumerate(sorted_keys, start=2):
        d = decisions[key]
        if not isinstance(d, dict):
            continue
        ws.cell(row=i, column=1, value=key)
        ws.cell(row=i, column=2, value=d.get("status", ""))
        ws.cell(row=i, column=3, value=d.get("reason", ""))
        ws.cell(row=i, column=4, value=d.get("note", ""))
        ws.cell(row=i, column=5, value=d.get("observed_value_at_decision", ""))
        ws.cell(row=i, column=6, value=d.get("decided_at", ""))
        ws.cell(row=i, column=7, value=d.get("decided_by", ""))

    if sorted_keys:
        last_col = get_column_letter(len(headers))
        ws.auto_filter.ref = f"A1:{last_col}{len(sorted_keys) + 1}"

    _autosize(ws)


# ── Helpers ─────────────────────────────────────────────────────────

def _kv_row(ws: Worksheet, row: int, label: str, value: object) -> None:
    ws.cell(row=row, column=1, value=label).font = _FONT_LABEL
    ws.cell(row=row, column=2, value=str(value))


def _header_row(ws: Worksheet, row: int, headers: list[str]) -> None:
    for j, h in enumerate(headers, start=1):
        cell = ws.cell(row=row, column=j, value=h)
        cell.font = _FONT_HEADER
        cell.fill = _FILL_HEADER
        cell.border = _THIN_BORDER
        cell.alignment = Alignment(horizontal="left")


def _autosize(ws: Worksheet, min_width: int = 10) -> None:
    for col_cells in ws.columns:
        max_len = min_width
        col_letter = get_column_letter(col_cells[0].column)  # type: ignore[union-attr]
        for cell in col_cells:
            if cell.value is not None:
                max_len = max(max_len, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = min(max_len + 2, 50)
