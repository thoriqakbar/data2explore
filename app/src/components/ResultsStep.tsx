import { useState } from "react";
import type { ProfileOutput, SummaryOutput, CheckOutput } from "../../../shared/index";

type SeverityFilter = "all" | "critical" | "warning";

interface Props {
  profileResult: ProfileOutput;
  summaryResult: SummaryOutput;
  checkResult?: CheckOutput | null;
  onStartOver: () => void;
  onExportReport?: () => void;
  exporting?: boolean;
}

export function ResultsStep({ profileResult, summaryResult, checkResult, onStartOver, onExportReport, exporting }: Props) {
  const { schema_profile } = profileResult;
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  const criticalCount = checkResult?.summary.by_severity["critical"] ?? 0;
  const warningCount = checkResult?.summary.by_severity["warning"] ?? 0;
  const totalFlags = checkResult?.summary.total_flags ?? 0;
  const skippedChecks = checkResult?.summary.skipped_checks ?? [];

  const filteredFlags = (checkResult?.flags ?? [])
    .filter((f) => severityFilter === "all" || f.severity === severityFilter)
    .sort((a, b) => {
      const order: Record<string, number> = { critical: 0, warning: 1 };
      const diff = (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
      if (diff !== 0) return diff;
      return a.check_id.localeCompare(b.check_id);
    });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Results</h2>
        <p className="text-sm text-gray-500">
          Profile overview, summary statistics, and HFC check results.
        </p>
      </div>

      {/* Profile card */}
      <div className="p-5 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
        <h3 className="font-semibold text-gray-800">Profile Overview</h3>
        <div className="flex gap-8 text-sm">
          <div>
            <span className="text-gray-500">Rows</span>
            <p className="text-xl font-semibold text-gray-900">
              {schema_profile.row_count}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Columns</span>
            <p className="text-xl font-semibold text-gray-900">
              {schema_profile.column_count}
            </p>
          </div>
        </div>

        {/* Missing data table */}
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
                      <span className={col.missing_count > 0 ? "text-amber-600 font-medium" : ""}>
                        {col.missing_count}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Summary stats table */}
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
                  <td className="py-2 pr-4 text-right">
                    {row.mean != null ? row.mean.toFixed(2) : "\u2014"}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {row.std_dev != null ? row.std_dev.toFixed(2) : "\u2014"}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {row.min != null ? row.min.toFixed(2) : "\u2014"}
                  </td>
                  <td className="py-2 text-right">
                    {row.max != null ? row.max.toFixed(2) : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* HFC Check Results */}
      {checkResult && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-800">HFC Check Results</h3>

          {/* Summary cards */}
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

          {/* Skipped checks info */}
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
              {/* Severity filter */}
              <div className="flex gap-1">
                {(["all", "critical", "warning"] as SeverityFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setSeverityFilter(f)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      severityFilter === f
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {f === "all" ? "All" : f === "critical" ? "Critical" : "Warning"}
                  </button>
                ))}
              </div>

              {/* Flag table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left py-2 pr-3 font-medium text-gray-600">Check</th>
                      <th className="text-left py-2 pr-3 font-medium text-gray-600">Severity</th>
                      <th className="text-left py-2 pr-3 font-medium text-gray-600">Column</th>
                      <th className="text-left py-2 pr-3 font-medium text-gray-600">Value</th>
                      <th className="text-left py-2 font-medium text-gray-600">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFlags.map((flag, i) => (
                      <tr key={`${flag.check_id}-${flag.id}-${flag.column_name}-${i}`} className="border-b border-gray-100">
                        <td className="py-2 pr-3">
                          <span className="text-xs font-medium text-gray-900">{flag.check_name}</span>
                          <span className="block text-[10px] font-mono text-gray-400">{flag.check_id}</span>
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                              flag.severity === "critical"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {flag.severity}
                          </span>
                        </td>
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
            </>
          )}
        </div>
      )}

      <div className="flex gap-3">
        {onExportReport && (
          <button
            onClick={onExportReport}
            disabled={exporting}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
          >
            {exporting ? "Exporting…" : "Export Report"}
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
