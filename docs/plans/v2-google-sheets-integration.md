# v2: Google Sheets Integration

**Status:** Future plan
**Date:** 2026-03-03

## Motivation

Field teams review HFC flags in Google Sheets — it's collaborative, familiar, and requires no software install for supervisors. Currently the workflow has a gap:

```
app exports CSV → email to supervisor → supervisor reviews in Sheets → ??? → manually re-import
```

Connecting directly to Sheets closes this loop.

## Scope (v1 of the feature)

Two one-way operations, not bidirectional sync:

### 1. Export flags to Google Sheet

- One-click "Export to Google Sheet" button alongside existing Excel/CSV export
- Creates a new Sheet in user's Google Drive with the same structure as the CSV export
- Sheet includes a frozen header row, conditional formatting for severity, and a "Status" column for reviewers
- Returns the Sheet URL so the user can share it with supervisors

### 2. Import reviewed decisions from Sheet URL

- User pastes a Google Sheet URL into an import dialog
- App reads the sheet via Sheets API (read-only scope)
- Parses the "Status" column (same logic as current CSV import: Resolved/Accepted/Dismissed)
- Merges imported decisions into the local decisions file
- Same flow as existing `handleImportReviewedCsv` but pulling from a URL instead of a local file

## Privacy considerations

- **Flags only, not raw data.** The sheet contains flag metadata (respondent ID, check ID, column name, observed value, message) — not the full dataset. This is the same data already exported via CSV.
- **Explicit opt-in.** Google auth is only triggered when the user clicks the export/import button. No background sync.
- **Clear messaging.** UI should state: "This will send flag data to Google Sheets. No raw survey data is shared."
- **Scopes.** Minimal OAuth scopes: `spreadsheets` (read/write for export, read for import). No Drive-wide access.

## Technical approach

### Auth
- Google OAuth 2.0 via Electron's `BrowserWindow` for consent flow
- Store refresh token in Electron `userData` (encrypted via `safeStorage`)
- Token refresh handled in main process, transparent to renderer

### API
- Use Google Sheets API v4 directly (REST) — no heavy SDK dependency
- `spreadsheets.create` + `values.update` for export
- `spreadsheets.values.get` for import
- Main process handles all API calls (renderer never sees tokens)

### IPC handlers
| Handler | Purpose |
|---------|---------|
| `google:auth` | Trigger OAuth consent, store tokens |
| `google:export-flags` | Create sheet, write flag data, return URL |
| `google:import-decisions` | Read sheet by URL, return parsed rows |
| `google:status` | Check if user is authenticated |

### UI
- Settings or profile area: "Connect Google Account" button with sign-out option
- Export dropdown: adds "Google Sheet" option when authenticated
- Import dialog: adds "From Google Sheet URL" tab when authenticated

## What this does NOT include (future)
- Real-time sync / polling for changes
- Bidirectional merge conflict resolution
- Google Drive file picker for selecting sheets
- Multi-sheet workbooks (one sheet per run)
- Offline queue for exports when no internet

## Open questions
1. Should export overwrite an existing sheet (same dataset) or always create new?
2. Should we support shared/team Google accounts or only individual?
3. Is there a simpler auth path (API key for read-only public sheets) that avoids OAuth for the import-only use case?
