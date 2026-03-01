import { useEffect, useMemo, useState } from "react";
import type { CheckOutput, FlagRow, ProfileOutput, SummaryOutput } from "../../../shared/index";

type SeverityFilter = "all" | "critical" | "warning";

type EnumeratorPatternRow = {
  enumerator_id: string;
  total_flags: number;
  critical_flags: number;
  warning_flags: number;
  affected_records: number;
  unique_checks: number;
  top_checks: Array<{ label: string; count: number }>;
  share_of_all_flags: number;
};

type EnumeratorRecordGroup = {
  id: string;
  module: string;
  flags: FlagRow[];
};

interface Props {
  profileResult: ProfileOutput;
  summaryResult: SummaryOutput;
  checkResult?: CheckOutput | null;
  onStartOver: () => void;
  onExportReport?: () => void;
  onExportFlags?: (content: string) => void;
  exporting?: boolean;
}

const CHECK_CATEGORY_LABELS: Record<string, string> = {
  "CHK-001": "ID / Duplicate",
  "CHK-002": "Missingness",
  "CHK-004": "Missingness",
  "CHK-005": "Range",
  "CHK-008": "Outliers",
  "CHK-009": "Enumerator risk",
  "CHK-010": "Duration",
};

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
  return text;
}

function toRunDate(value: string): string {
  return value.slice(0, 10);
}

function checkLabel(checkId: string): string {
  return CHECK_CATEGORY_LABELS[checkId] ?? checkId;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

export function ResultsStep({
  profileResult,
  summaryResult,
  checkResult,
  onStartOver,
  onExportReport,
  onExportFlags,
  exporting,
}: Props) {
  const { schema_profile } = profileResult;
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [enumeratorFilter, setEnumeratorFilter] = useState<string>("all");
  const [selectedEnumerator, setSelectedEnumerator] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({ from: "", to: "" });

  const criticalCount = checkResult?.summary.by_severity["critical"] ?? 0;
  const warningCount = checkResult?.summary.by_severity["warning"] ?? 0;
  const totalFlags = checkResult?.summary.total_flags ?? 0;
  const skippedChecks = checkResult?.summary.skipped_checks ?? [];
  const allFlags = checkResult?.flags ?? [];

  const preEnumeratorFlags = useMemo(() => {
    return allFlags
      .filter((flag) => severityFilter === "all" || flag.severity === severityFilter)
      .filter((flag) => !dateRange.from || toRunDate(flag.created_at) >= dateRange.from)
      .filter((flag) => !dateRange.to || toRunDate(flag.created_at) <= dateRange.to);
  }, [allFlags, severityFilter, dateRange]);

  const enumeratorPatterns = useMemo<EnumeratorPatternRow[]>(() => {
    const grouped = new Map<string, FlagRow[]>();
    for (const flag of preEnumeratorFlags) {
      if (!flag.enumerator_id) continue;
      grouped.set(flag.enumerator_id, [...(grouped.get(flag.enumerator_id) ?? []), flag]);
    }
    const totalVisibleFlags = preEnumeratorFlags.length || 1;
    return [...grouped.entries()]
      .map(([enumeratorId, flags]) => {
        const byCheck: Record<string, number> = {};
        const uniqueRecords = new Set<string>();
        let criticalFlags = 0;
        let warningFlags = 0;
        for (const flag of flags) {
          byCheck[flag.check_id] = (byCheck[flag.check_id] ?? 0) + 1;
          if (flag.id) uniqueRecords.add(flag.id);
          if (flag.severity === "critical") criticalFlags += 1;
          if (flag.severity === "warning") warningFlags += 1;
        }
        return {
          enumerator_id: enumeratorId,
          total_flags: flags.length,
          critical_flags: criticalFlags,
          warning_flags: warningFlags,
          affected_records: uniqueRecords.size,
          unique_checks: Object.keys(byCheck).length,
          top_checks: Object.entries(byCheck)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 3)
            .map(([checkId, count]) => ({ label: checkLabel(checkId), count })),
          share_of_all_flags: flags.length / totalVisibleFlags,
        };
      })
      .sort((a, b) =>
        b.critical_flags - a.critical_flags ||
        b.total_flags - a.total_flags ||
        b.affected_records - a.affected_records ||
        a.enumerator_id.localeCompare(b.enumerator_id)
      );
  }, [preEnumeratorFlags]);

  useEffect(() => {
    if (enumeratorPatterns.length === 0) {
      setSelectedEnumerator(null);
      return;
    }
    if (!selectedEnumerator || !enumeratorPatterns.some((row) => row.enumerator_id === selectedEnumerator)) {
      setSelectedEnumerator(enumeratorPatterns[0].enumerator_id);
    }
  }, [enumeratorPatterns, selectedEnumerator]);

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
          (order[a.severity] ?? 2) - (order[b.severity] ?? 2) ||
          a.enumerator_id.localeCompare(b.enumerator_id) ||
          a.check_id.localeCompare(b.check_id)
        );
      });
  }, [preEnumeratorFlags, enumeratorFilter]);

  const selectedPattern = useMemo(
    () => enumeratorPatterns.find((row) => row.enumerator_id === selectedEnumerator) ?? null,
    [enumeratorPatterns, selectedEnumerator]
  );

  const selectedEnumeratorGroups = useMemo<EnumeratorRecordGroup[]>(() => {
    if (!selectedEnumerator) return [];
    const groups = new Map<string, EnumeratorRecordGroup>();
    for (const flag of preEnumeratorFlags) {
      if (flag.enumerator_id !== selectedEnumerator) continue;
      const key = flag.id || "Unknown record";
      const existing = groups.get(key) ?? { id: key, module: flag.module, flags: [] };
      existing.flags.push(flag);
      if (!existing.module && flag.module) existing.module = flag.module;
      groups.set(key, existing);
    }
    return [...groups.values()].sort((a, b) => {
      const criticalA = a.flags.filter((flag) => flag.severity === "critical").length;
      const criticalB = b.flags.filter((flag) => flag.severity === "critical").length;
      return criticalB - criticalA || b.flags.length - a.flags.length || a.id.localeCompare(b.id);
    });
  }, [preEnumeratorFlags, selectedEnumerator]);

  const flagsWithMissingEnumerator = preEnumeratorFlags.filter((flag) => !flag.enumerator_id).length;
  const filtersActive =
    severityFilter !== "all" || enumeratorFilter !== "all" || dateRange.from !== "" || dateRange.to !== "";

  const exportFlagsCsv = () => {
    if (!onExportFlags) return;
    const headers: (keyof FlagRow)[] = [
      "run_id", "check_id", "check_name", "severity", "status",
      "id", "enumerator_id", "module", "column_name", "observed_value",
      "rule_reference", "message", "created_at",
    ];
    const sorted = [...filteredFlags].sort((a, b) =>
      a.enumerator_id.localeCompare(b.enumerator_id) ||
      ({ critical: 0, warning: 1 }[a.severity] ?? 2) - ({ critical: 0, warning: 1 }[b.severity] ?? 2) ||
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

  const focusEnumerator = (enumeratorId: string) => {
    setSelectedEnumerator(enumeratorId);
    setEnumeratorFilter(enumeratorId);
  };

  const clearEnumeratorFocus = () => setEnumeratorFilter("all");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Results</h2>
        <p className="text-sm text-gray-500">
          Profile overview, summary statistics, enumerator patterns, and raw HFC check results.
        </p>
      </div>

      <div className="p-5 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
        <h3 className="font-semibold text-gray-800">Profile Overview</h3>
        <div className="flex gap-8 text-sm">
          <div>
            <span className="text-gray-500">Rows</span>
            <p className="text-xl font-semibold text-gray-900">{schema_profile.row_count}</p>
          </div>
          <div>
            <span className="text-gray-500">Columns</span>
            <p className="text-xl font-semibold text-gray-900">{schema_profile.column_count}</p>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Column Details</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-1.5 pr-4 font-medium text-gray-600">Column</th>
                  <th className="text-left py-1.5 pr-4 font-medium text-gray-600">Type</th>
                  <th className="text-right py-1.5 pr-4 font-medium text-gray-600">Non-missing</th>
                  <th className="text-right py-1.5 font-medium text-gray-600">Missing</th>
                </tr>
              </thead>
              <tbody>
                {schema_profile.columns.map((col) => (
                  <tr key={col.name} className="border-b border-gray-100">
                    <td className="py-1.5 pr-4 font-mono text-xs">{col.name}</td>
                    <td className="py-1.5 pr-4 text-gray-500">{col.dtype}</td>
                    <td className="py-1.5 pr-4 text-right">{col.non_missing_count}</td>
                    <td className="py-1.5 text-right">
                      <span className={col.missing_count > 0 ? "text-amber-600 font-medium" : ""}>{col.missing_count}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-gray-800">Summary Statistics</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left py-2 pr-4 font-medium text-gray-600">Variable</th>
                <th className="text-right py-2 pr-4 font-medium text-gray-600">Obs</th>
                <th className="text-right py-2 pr-4 font-medium text-gray-600">Mean</th>
                <th className="text-right py-2 pr-4 font-medium text-gray-600">Std Dev</th>
                <th className="text-right py-2 pr-4 font-medium text-gray-600">Min</th>
                <th className="text-right py-2 font-medium text-gray-600">Max</th>
              </tr>
            </thead>
            <tbody>
              {summaryResult.summary_stats.map((row) => (
                <tr key={row.variable} className="border-b border-gray-100">
                  <td className="py-2 pr-4 font-mono text-xs">{row.variable}</td>
                  <td className="py-2 pr-4 text-right">{row.obs}</td>
                  <td className="py-2 pr-4 text-right">{row.mean != null ? row.mean.toFixed(2) : "\u2014"}</td>
                  <td className="py-2 pr-4 text-right">{row.std_dev != null ? row.std_dev.toFixed(2) : "\u2014"}</td>
                  <td className="py-2 pr-4 text-right">{row.min != null ? row.min.toFixed(2) : "\u2014"}</td>
                  <td className="py-2 text-right">{row.max != null ? row.max.toFixed(2) : "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {checkResult && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-800">HFC Check Results</h3>

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
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
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

          {totalFlags === 0 ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 font-medium text-center">
              No issues found — all checks passed.
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
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </label>
                    <label className="text-sm text-gray-700">
                      To
                      <input
                        type="date"
                        value={dateRange.to}
                        onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))}
                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
                  <span>
                    Showing {filteredFlags.length} of {allFlags.length} flags. Date filter uses run timestamp from `created_at`.
                  </span>
                  {filtersActive && (
                    <button
                      onClick={clearFilters}
                      className="px-3 py-1.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h4 className="font-semibold text-gray-800">Enumerator Patterns</h4>
                  <p className="text-sm text-gray-500">
                    Ranked view of which enumerators are driving repeated issue patterns across the visible flags.
                  </p>
                </div>

                {enumeratorPatterns.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-3 font-medium text-gray-600">Enumerator</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600">Total Flags</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600">Critical</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600">Affected Records</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-600">Top Checks</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-600">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enumeratorPatterns.map((row) => {
                          const isSelected = row.enumerator_id === selectedEnumerator;
                          return (
                            <tr
                              key={row.enumerator_id}
                              className={`border-b border-gray-100 cursor-pointer transition-colors ${
                                isSelected ? "bg-blue-50" : "hover:bg-gray-50"
                              }`}
                              onClick={() => focusEnumerator(row.enumerator_id)}
                            >
                              <td className="py-3 px-3">
                                <span className="font-mono text-xs font-medium text-gray-900">{row.enumerator_id}</span>
                              </td>
                              <td className="py-3 px-3 text-right font-medium text-gray-900">{row.total_flags}</td>
                              <td className="py-3 px-3 text-right">
                                <span className={row.critical_flags > 0 ? "font-medium text-red-700" : "text-gray-500"}>
                                  {row.critical_flags}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right text-gray-700">{row.affected_records}</td>
                              <td className="py-3 px-3 text-xs text-gray-700">
                                {row.top_checks.map((item) => `${item.label} (${item.count})`).join(", ")}
                              </td>
                              <td className="py-3 px-3 text-right text-gray-700">{formatPercent(row.share_of_all_flags)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                    {flagsWithMissingEnumerator > 0
                      ? "No enumerator-based patterns available because the visible flags do not carry usable enumerator IDs."
                      : "No enumerator-based patterns are available for the current filters."}
                  </div>
                )}
              </div>

              {selectedPattern && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-gray-800">Enumerator Detail</h4>
                      <p className="text-sm text-gray-500">
                        Flagged records and recurring anomaly types for enumerator <span className="font-mono">{selectedPattern.enumerator_id}</span>.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => focusEnumerator(selectedPattern.enumerator_id)}
                        className="px-3 py-1.5 border border-blue-300 rounded-md text-sm text-blue-700 hover:bg-blue-50 transition-colors"
                      >
                        Show Raw Flags
                      </button>
                      {enumeratorFilter !== "all" && (
                        <button
                          onClick={clearEnumeratorFocus}
                          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Clear Raw Focus
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-xl font-bold text-gray-900">{selectedPattern.total_flags}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Visible Flags</p>
                    </div>
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-xl font-bold text-red-700">{selectedPattern.critical_flags}</p>
                      <p className="text-xs text-red-600 mt-0.5">Critical</p>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-xl font-bold text-amber-700">{selectedPattern.warning_flags}</p>
                      <p className="text-xs text-amber-600 mt-0.5">Warning</p>
                    </div>
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-xl font-bold text-gray-900">{selectedPattern.affected_records}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Affected Records</p>
                    </div>
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-xl font-bold text-gray-900">{selectedPattern.unique_checks}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Distinct Checks</p>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
                    <div>
                      <h5 className="text-sm font-medium text-gray-700">Check Mix</h5>
                      <p className="text-xs text-gray-500">
                        Categories with the highest repeated anomaly counts for this enumerator.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedPattern.top_checks.map((item) => (
                        <span
                          key={item.label}
                          className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-gray-300 text-xs text-gray-700"
                        >
                          {item.label} ({item.count})
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h5 className="text-sm font-medium text-gray-700">Flagged Records</h5>
                    {selectedEnumeratorGroups.map((group) => (
                      <div key={group.id} className="border border-gray-200 rounded-lg bg-white">
                        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center gap-3">
                          <span className="text-sm font-medium text-gray-900">
                            Record <span className="font-mono text-xs">{group.id}</span>
                          </span>
                          <span className="text-xs text-gray-500">
                            {group.flags.length} flag{group.flags.length === 1 ? "" : "s"}
                          </span>
                          {group.module && (
                            <span className="text-xs text-gray-500">
                              Module: <span className="font-mono">{group.module}</span>
                            </span>
                          )}
                        </div>
                        <div className="divide-y divide-gray-100">
                          {group.flags.map((flag, index) => (
                            <div key={`${group.id}-${flag.check_id}-${index}`} className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[160px_110px_1fr] gap-3">
                              <div>
                                <p className="text-sm font-medium text-gray-900">{flag.check_name}</p>
                                <p className="text-[11px] font-mono text-gray-400">{flag.check_id}</p>
                              </div>
                              <div className="space-y-1">
                                <span
                                  className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                                    flag.severity === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {flag.severity}
                                </span>
                                <p className="font-mono text-xs text-gray-500">{flag.column_name || "\u2014"}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-gray-700">{flag.message}</p>
                                <p className="text-xs text-gray-500">
                                  Observed value: <span className="font-mono">{flag.observed_value || "\u2014"}</span>
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-gray-800">All Flags</h4>
                    <p className="text-sm text-gray-500">
                      Raw flag list for detailed review. This remains the canonical full audit view.
                    </p>
                  </div>
                  {enumeratorFilter !== "all" && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">
                        Showing raw flags for enumerator <span className="font-mono">{enumeratorFilter}</span>
                      </span>
                      <button
                        onClick={clearEnumeratorFocus}
                        className="px-3 py-1.5 border border-gray-300 rounded-md text-xs text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Clear enumerator focus
                      </button>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-300">
                        <th className="text-left py-2 pr-3 font-medium text-gray-600">Check</th>
                        <th className="text-left py-2 pr-3 font-medium text-gray-600">Severity</th>
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
                                flag.severity === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {flag.severity}
                            </span>
                          </td>
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
      )}

      <div className="flex gap-3">
        {onExportFlags && (
          <button
            onClick={exportFlagsCsv}
            className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm transition-colors"
          >
            {filtersActive ? "Export Filtered Flags (CSV)" : "Export Flags (CSV)"}
          </button>
        )}
        {onExportReport && (
          <button
            onClick={onExportReport}
            disabled={exporting}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
          >
            {exporting ? "Exporting..." : "Export Report"}
          </button>
        )}
        <button
          onClick={onStartOver}
          className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm transition-colors"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}
