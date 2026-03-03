import type { FlagDecision } from "../../../shared/index";

/**
 * Status values that map to "dismissed" (resolved).
 * Case-insensitive matching.
 */
const RESOLVED_STATUSES = new Set([
  "resolved",
  "accepted",
  "dismiss",
  "dismissed",
  "not a problem",
  "false positive",
]);

interface ParseResult {
  decisions: Record<string, FlagDecision>;
  importedCount: number;
  skippedCount: number;
}

/**
 * Map display headers (from Excel export) to internal field names.
 * Both forms are accepted; lookup is case-insensitive.
 */
const HEADER_ALIASES: Record<string, string> = {
  "check id": "check_id",
  "check name": "check_name",
  "column": "column_name",
  "enumerator": "enumerator_id",
  "survey date": "survey_date",
  "value": "observed_value",
  "run date": "created_at",
};

/**
 * Parse a reviewed CSV (exported from Excel or Google Sheets) and extract decisions.
 *
 * Accepts both internal field names (check_id, column_name) and display headers
 * (Check ID, Column) as used in the Excel report.
 * Rows where status matches a "resolved" synonym become dismissed decisions.
 */
export function parseReviewedCsv(csvText: string): ParseResult {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) {
    return { decisions: {}, importedCount: 0, skippedCount: 0 };
  }

  // Parse header — find column indices, normalising display names to internal names
  const headerLine = lines[0];
  const headers = parseCsvRow(headerLine).map((h) => {
    const lower = h.trim().toLowerCase();
    return HEADER_ALIASES[lower] ?? lower;
  });

  const idIdx = headers.indexOf("id");
  const checkIdIdx = headers.indexOf("check_id");
  const columnNameIdx = headers.indexOf("column_name");
  const enumeratorIdIdx = headers.indexOf("enumerator_id");
  const surveyDateIdx = headers.indexOf("survey_date");
  const statusIdx = headers.indexOf("status");
  const noteIdx = headers.indexOf("note");
  const observedValueIdx = headers.indexOf("observed_value");

  // Must have at least id, check_id, column_name, status
  if (idIdx === -1 || checkIdIdx === -1 || columnNameIdx === -1 || statusIdx === -1) {
    return { decisions: {}, importedCount: 0, skippedCount: lines.length - 1 };
  }

  const decisions: Record<string, FlagDecision> = {};
  let importedCount = 0;
  let skippedCount = 0;
  const now = new Date().toISOString();

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvRow(lines[i]);
    const id = fields[idIdx]?.trim() ?? "";
    const checkId = fields[checkIdIdx]?.trim() ?? "";
    const columnName = fields[columnNameIdx]?.trim() ?? "";
    const enumeratorId = enumeratorIdIdx !== -1 ? (fields[enumeratorIdIdx]?.trim() ?? "") : "";
    const surveyDate = surveyDateIdx !== -1 ? (fields[surveyDateIdx]?.trim() ?? "") : "";
    const status = fields[statusIdx]?.trim() ?? "";
    const note = noteIdx !== -1 ? (fields[noteIdx]?.trim() ?? "") : "";
    const observedValue = observedValueIdx !== -1 ? (fields[observedValueIdx]?.trim() ?? "") : "";

    if (!status || !RESOLVED_STATUSES.has(status.toLowerCase())) {
      skippedCount++;
      continue;
    }

    const key = `${id}|${checkId}|${columnName}|${enumeratorId}|${surveyDate}`;
    decisions[key] = {
      status: "dismissed",
      reason: status.toLowerCase(),
      note,
      observed_value_at_decision: observedValue,
      decided_at: now,
      decided_by: "csv_import",
    };
    importedCount++;
  }

  return { decisions, importedCount, skippedCount };
}

/**
 * Minimal RFC 4180 CSV row parser. Handles quoted fields with escaped quotes.
 */
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}
