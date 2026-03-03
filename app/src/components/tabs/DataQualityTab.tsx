import { useEffect, useMemo, useState } from "react";
import type { CheckOutput, FlagDecision, FlagRow } from "../../../../shared/index";
import { buildProblemSections, categoryForCheckId } from "../results/problemReview";
import { ProblemReviewSection } from "../ProblemReviewSection";

type SeverityFilter = "all" | "critical" | "warning";

interface Props {
  checkResult: CheckOutput | null | undefined;
  onExportFlags?: (content: string) => void;
  initialEnumerator?: string | null;
  onResolveFlags?: (flags: FlagRow[], reason: string, note: string) => void;
  onUnresolveFlags?: (flags: FlagRow[]) => void;
  onImportReviewedCsv?: () => void;
  onExportDofile?: () => void;
  suppressedFlags?: FlagRow[];
  decisions?: Record<string, FlagDecision>;
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toRunDate(value: string): string {
  return value.slice(0, 10);
}

function checkLabel(checkId: string): string {
  return categoryForCheckId(checkId);
}

export function DataQualityTab({ checkResult, onExportFlags, initialEnumerator, onResolveFlags, onUnresolveFlags, onImportReviewedCsv, onExportDofile, suppressedFlags, decisions }: Props) {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [enumeratorFilter, setEnumeratorFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [showDecided, setShowDecided] = useState(false);

  useEffect(() => {
    if (initialEnumerator) {
      setEnumeratorFilter(initialEnumerator);
    }
  }, [initialEnumerator]);

  const totalUnfilteredFlags = checkResult?.summary.total_flags ?? 0;
  const totalSuppressed = checkResult?.summary.suppressed_count ?? 0;
  const skippedChecks = checkResult?.summary.skipped_checks ?? [];
  const allFlags = checkResult?.flags ?? [];

  const preEnumeratorFlags = useMemo(() => {
    return allFlags
      .filter((flag) => severityFilter === "all" || flag.severity.toLowerCase() === severityFilter)
      .filter((flag) => !dateRange.from || toRunDate(flag.created_at) >= dateRange.from)
      .filter((flag) => !dateRange.to || toRunDate(flag.created_at) <= dateRange.to);
  }, [allFlags, severityFilter, dateRange]);

  const enumerators = useMemo(
    () => [...new Set(allFlags.map((flag) => flag.enumerator_id).filter(Boolean))].sort(),
    [allFlags]
  );

  const filteredFlags = useMemo(() => {
    return [...preEnumeratorFlags]
      .filter((flag) => enumeratorFilter === "all" || flag.enumerator_id === enumeratorFilter)
      .sort((a, b) => {
        const order: Record<string, number> = { critical: 0, warning: 1 };
        return (
          (order[a.severity.toLowerCase()] ?? 2) - (order[b.severity.toLowerCase()] ?? 2) ||
          a.enumerator_id.localeCompare(b.enumerator_id) ||
          a.check_id.localeCompare(b.check_id)
        );
      });
  }, [preEnumeratorFlags, enumeratorFilter]);

  const totalFlags = filteredFlags.length;
  const criticalCount = filteredFlags.filter(f => f.severity.toLowerCase() === "critical").length;
  const warningCount = filteredFlags.filter(f => f.severity.toLowerCase() === "warning").length;

  const problemSections = useMemo(
    () => buildProblemSections(filteredFlags),
    [filteredFlags]
  );

  const filtersActive =
    severityFilter !== "all" || enumeratorFilter !== "all" || dateRange.from !== "" || dateRange.to !== "";

  const exportFlagsCsv = () => {
    if (!onExportFlags) return;
    const headers: (keyof FlagRow)[] = [
      "run_id", "check_id", "check_name", "severity", "status",
      "id", "enumerator_id", "column_name", "observed_value",
      "rule_reference", "message", "created_at",
    ];
    const sorted = [...filteredFlags].sort((a, b) =>
      a.enumerator_id.localeCompare(b.enumerator_id) ||
      ({ critical: 0, warning: 1 }[a.severity.toLowerCase()] ?? 2) - ({ critical: 0, warning: 1 }[b.severity.toLowerCase()] ?? 2) ||
      a.check_id.localeCompare(b.check_id)
    );
    onExportFlags([
      headers.join(","),
      ...sorted.map((flag) => headers.map((header) => csvEscape(flag[header])).join(",")),
    ].join("\n"));
  };

  const clearFilters = () => {
    setSeverityFilter("all");
    setEnumeratorFilter("all");
    setDateRange({ from: "", to: "" });
  };

  if (!checkResult) {
    return (
      <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 text-center">
        No check results available. Checks may have been skipped or failed to run.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {checkResult.summary.has_prior_run && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xl font-bold text-red-700">{checkResult.summary.new_flags_count}</p>
            <p className="text-xs text-red-700">New flags since previous run</p>
          </div>
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-xl font-bold text-green-700">{checkResult.summary.resolved_flags_count}</p>
            <p className="text-xs text-green-700">Resolved since previous run</p>
          </div>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-xl font-bold text-gray-700">{checkResult.summary.persisting_flags_count}</p>
            <p className="text-xs text-gray-700">Persisting since previous run</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
          <p className="text-2xl font-bold text-gray-900">{totalFlags}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Flags</p>
        </div>
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
          <p className="text-2xl font-bold text-red-700">{criticalCount}</p>
          <p className="text-xs text-red-600 mt-0.5">Critical</p>
        </div>
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
          <p className="text-2xl font-bold text-amber-700">{warningCount}</p>
          <p className="text-xs text-amber-600 mt-0.5">Warning</p>
        </div>
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
          <p className="text-2xl font-bold text-gray-500">{skippedChecks.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Skipped</p>
        </div>
      </div>

      {skippedChecks.length > 0 && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">
          <p className="font-medium mb-1">Skipped checks</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            {skippedChecks.map((s) => (
              <li key={s.check_id}>
                <span className="font-mono">{s.check_id}</span>: {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {totalSuppressed > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
            <span className="text-slate-600">
              <span className="font-medium">{totalSuppressed}</span> flag{totalSuppressed === 1 ? "" : "s"} resolved
              {checkResult.summary.total_before_suppression
                ? ` (of ${checkResult.summary.total_before_suppression} total)`
                : ""
              }
            </span>
            <button
              onClick={() => setShowDecided(prev => !prev)}
              className="px-3 py-1 text-xs font-medium rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
            >
              {showDecided ? "Hide resolved" : "Show resolved"}
            </button>
          </div>

          {showDecided && suppressedFlags && suppressedFlags.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                <h4 className="text-sm font-medium text-slate-700">Resolved Flags</h4>
              </div>
              <div className="overflow-x-auto overflow-y-auto max-h-64">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs">ID</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs">Enumerator</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs">Check</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs">Column</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs">Value</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs">Message</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-500 text-xs"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppressedFlags.map((flag, i) => (
                      <tr key={`sup-${flag.id}-${flag.check_id}-${flag.column_name}-${i}`} className="border-b border-slate-100 text-slate-500">
                        <td className="py-2 px-3 font-mono text-xs">{flag.id || "\u2014"}</td>
                        <td className="py-2 px-3 font-mono text-xs">{flag.enumerator_id || "\u2014"}</td>
                        <td className="py-2 px-3 text-xs">
                          <span className="font-medium">{flag.check_name}</span>
                          <span className="block text-[10px] font-mono text-slate-400">{flag.check_id}</span>
                        </td>
                        <td className="py-2 px-3 font-mono text-xs">{flag.column_name || "\u2014"}</td>
                        <td className="py-2 px-3 text-xs max-w-[100px] truncate" title={flag.observed_value}>{flag.observed_value || "\u2014"}</td>
                        <td className="py-2 px-3 text-xs">{flag.message}</td>
                        <td className="py-2 px-3 text-right">
                          {onUnresolveFlags && (
                            <button
                              onClick={() => onUnresolveFlags([flag])}
                              className="px-2 py-0.5 text-[11px] font-medium rounded bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                            >
                              Unresolve
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {totalUnfilteredFlags === 0 && totalSuppressed === 0 ? (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 font-medium text-center">
          No issues found — all checks passed.
        </div>
      ) : totalUnfilteredFlags === 0 && totalSuppressed > 0 ? (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 font-medium text-center">
          All remaining flags have been resolved.
        </div>
      ) : (
        <>
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
            <div className="flex flex-wrap gap-2">
              {(["all", "critical", "warning"] as SeverityFilter[]).map((filterValue) => (
                <button
                  key={filterValue}
                  onClick={() => setSeverityFilter(filterValue)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    severityFilter === filterValue ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {filterValue === "all" ? "All" : filterValue === "critical" ? "Critical" : "Warning"}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm text-gray-700">
                Enumerator
                <select
                  value={enumeratorFilter}
                  onChange={(event) => setEnumeratorFilter(event.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  <option value="all">All enumerators</option>
                  {enumerators.map((enumerator) => (
                    <option key={enumerator} value={enumerator}>
                      {enumerator}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-gray-700">
                  From
                  <input
                    type="date"
                    value={dateRange.from}
                    onChange={(event) => setDateRange((current) => ({ ...current, from: event.target.value }))}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </label>
                <label className="text-sm text-gray-700">
                  To
                  <input
                    type="date"
                    value={dateRange.to}
                    onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
              <span>
                Showing {filteredFlags.length} of {totalUnfilteredFlags} flags. Date filter uses run timestamp from `created_at`.
              </span>
              <div className="flex gap-2">
                {filtersActive && (
                  <button
                    onClick={clearFilters}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Clear Filters
                  </button>
                )}
                {onImportReviewedCsv && (
                  <button
                    onClick={onImportReviewedCsv}
                    className="px-3 py-1.5 border border-indigo-300 text-indigo-700 rounded-md hover:bg-indigo-50 font-medium transition-colors"
                  >
                    Import Reviewed CSV
                  </button>
                )}
                {onExportDofile && (
                  <button
                    onClick={onExportDofile}
                    className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 font-medium transition-colors"
                  >
                    Export Stata .do
                  </button>
                )}
                {onExportFlags && (
                  <button
                    onClick={exportFlagsCsv}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 font-medium transition-colors"
                  >
                    {filtersActive ? "Export Filtered (CSV)" : "Export CSV"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {problemSections.length > 0 && (
            <div className="space-y-3">
              <div>
                <h4 className="font-semibold text-gray-800">Problem Review</h4>
                <p className="text-sm text-gray-500">
                  Flags grouped by problem type. Sorted by severity — address critical issues first.
                </p>
              </div>
              {problemSections.map((section, index) => (
                <ProblemReviewSection
                  key={section.key}
                  section={section}
                  defaultExpanded={index === 0}
                  onResolveFlags={onResolveFlags}
                />
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <h4 className="font-semibold text-gray-800">All Flags</h4>
              <p className="text-sm text-gray-500">
                Raw flag list for detailed review and audit.
              </p>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-96 rounded">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-2 pr-3 font-medium text-gray-600">Check</th>
                    <th className="text-left py-2 pr-3 font-medium text-gray-600">Severity</th>
                    <th className="text-left py-2 pr-3 font-medium text-gray-600">ID</th>
                    <th className="text-left py-2 pr-3 font-medium text-gray-600">Enumerator</th>
                    <th className="text-left py-2 pr-3 font-medium text-gray-600">Column</th>
                    <th className="text-left py-2 pr-3 font-medium text-gray-600">Value</th>
                    <th className="text-left py-2 font-medium text-gray-600">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFlags.map((flag, index) => (
                    <tr key={`${flag.check_id}-${flag.id}-${flag.column_name}-${index}`} className="border-b border-gray-100">
                      <td className="py-2 pr-3">
                        <span className="text-xs font-medium text-gray-900">{flag.check_name}</span>
                        <span className="block text-[10px] font-mono text-gray-400">{flag.check_id}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                            flag.severity.toLowerCase() === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {flag.severity}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{flag.id || "\u2014"}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{flag.enumerator_id || "\u2014"}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{flag.column_name || "\u2014"}</td>
                      <td className="py-2 pr-3 text-xs max-w-[120px] truncate" title={flag.observed_value}>
                        {flag.observed_value || "\u2014"}
                      </td>
                      <td className="py-2 text-xs text-gray-700">{flag.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </>
      )}
    </div>
  );
}
