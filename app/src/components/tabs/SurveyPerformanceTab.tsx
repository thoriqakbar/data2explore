import { useMemo, useState } from "react";
import type { FlagRow, PerformanceOutput } from "../../../../shared/index";
import { categoryForCheckId } from "../results/problemReview";
import { DailyCompletionsChart } from "../charts/DailyCompletionsChart";
import { VariableHistogramChart } from "../charts/VariableHistogramChart";

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

interface Props {
  performanceResult: PerformanceOutput | null | undefined;
  checkFlags?: FlagRow[];
  onSelectEnumerator?: (id: string) => void;
}

type SortKey = "enumerator_id" | "total_surveys" | "surveys_per_day" | "avg_duration" | "flag_count";
type SortDir = "asc" | "desc";

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function SurveyPerformanceTab({ performanceResult, checkFlags, onSelectEnumerator }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("total_surveys");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedEnumerators = useMemo(() => {
    if (!performanceResult) return [];
    return [...performanceResult.enumerator_stats].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      if (typeof valA === "string" && typeof valB === "string") {
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === "asc" ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [performanceResult, sortKey, sortDir]);

  const enumeratorPatterns = useMemo<EnumeratorPatternRow[]>(() => {
    if (!checkFlags || checkFlags.length === 0) return [];
    const grouped = new Map<string, FlagRow[]>();
    for (const flag of checkFlags) {
      if (!flag.enumerator_id) continue;
      grouped.set(flag.enumerator_id, [...(grouped.get(flag.enumerator_id) ?? []), flag]);
    }
    const totalFlags = checkFlags.length || 1;
    return [...grouped.entries()]
      .map(([enumeratorId, flags]) => {
        const byCheck: Record<string, number> = {};
        const uniqueRecords = new Set<string>();
        let criticalFlags = 0;
        let warningFlags = 0;
        for (const flag of flags) {
          byCheck[flag.check_id] = (byCheck[flag.check_id] ?? 0) + 1;
          if (flag.id) uniqueRecords.add(flag.id);
          if (flag.severity.toLowerCase() === "critical") criticalFlags += 1;
          if (flag.severity.toLowerCase() === "warning") warningFlags += 1;
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
            .map(([checkId, count]) => ({ label: categoryForCheckId(checkId), count })),
          share_of_all_flags: flags.length / totalFlags,
        };
      })
      .sort((a, b) =>
        b.critical_flags - a.critical_flags ||
        b.total_flags - a.total_flags ||
        b.affected_records - a.affected_records ||
        a.enumerator_id.localeCompare(b.enumerator_id)
      );
  }, [checkFlags]);

  if (!performanceResult || !performanceResult.ok) {
    return (
      <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 text-center">
        {performanceResult?.errors?.[0] ??
          "Performance metrics are not available. Ensure the survey_date mapping is configured."}
      </div>
    );
  }

  const { totals, duration_stats } = performanceResult;

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return "\u2195";
    return sortDir === "asc" ? "\u2191" : "\u2193";
  };

  return (
    <div className="space-y-6">
      {/* Totals cards */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
            <p className="text-2xl font-bold text-gray-900">{totals.total_surveys.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total Surveys</p>
          </div>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
            <p className="text-2xl font-bold text-gray-900">{totals.total_enumerators}</p>
            <p className="text-xs text-gray-500 mt-0.5">Enumerators</p>
          </div>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
            <p className="text-2xl font-bold text-gray-900">{totals.date_range_days}</p>
            <p className="text-xs text-gray-500 mt-0.5">Days of Fieldwork</p>
          </div>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
            <p className="text-2xl font-bold text-gray-900 text-base">{formatDate(totals.first_date)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Survey Start</p>
          </div>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
            <p className="text-2xl font-bold text-gray-900 text-base">{formatDate(totals.last_date)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Latest Survey</p>
          </div>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
            <p className="text-2xl font-bold text-gray-900">
              {duration_stats ? `${duration_stats.overall_mean.toFixed(0)} min` : "\u2014"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Avg Duration</p>
          </div>
        </div>
      )}

      {/* Daily completions chart */}
      <div className="space-y-2">
        <h3 className="font-semibold text-gray-800">Daily Completions</h3>
        <DailyCompletionsChart data={performanceResult.daily_completions} />
      </div>

      {/* Duration distribution */}
      {duration_stats && (
        <div className="space-y-2">
          <h3 className="font-semibold text-gray-800">Duration Distribution</h3>
          <p className="text-sm text-gray-500">
            Column: <span className="font-mono text-xs">{duration_stats.column}</span>
            {" \u00b7 "}
            Median: {duration_stats.overall_median.toFixed(1)} min
            {duration_stats.overall_std != null && (
              <>{" \u00b7 "}SD: {duration_stats.overall_std.toFixed(1)}</>
            )}
          </p>
          <VariableHistogramChart
            histogram={duration_stats.histogram}
            mean={duration_stats.overall_mean}
            label="Duration (min)"
          />
        </div>
      )}

      {/* Enumerator stats table */}
      {sortedEnumerators.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-gray-800">Enumerator Stats</h3>
          <div className="max-h-[400px] overflow-y-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="border-b border-gray-200">
                  <th
                    className="text-left py-2 px-3 font-medium text-gray-600 cursor-pointer select-none"
                    onClick={() => handleSort("enumerator_id")}
                  >
                    Enumerator {sortIcon("enumerator_id")}
                  </th>
                  <th
                    className="text-right py-2 px-3 font-medium text-gray-600 cursor-pointer select-none"
                    onClick={() => handleSort("total_surveys")}
                  >
                    Surveys {sortIcon("total_surveys")}
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Active Days</th>
                  <th
                    className="text-right py-2 px-3 font-medium text-gray-600 cursor-pointer select-none"
                    onClick={() => handleSort("surveys_per_day")}
                  >
                    Per Day {sortIcon("surveys_per_day")}
                  </th>
                  <th
                    className="text-right py-2 px-3 font-medium text-gray-600 cursor-pointer select-none"
                    onClick={() => handleSort("avg_duration")}
                  >
                    Avg Dur. {sortIcon("avg_duration")}
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Date Range</th>
                  <th
                    className="text-right py-2 px-3 font-medium text-gray-600 cursor-pointer select-none"
                    onClick={() => handleSort("flag_count")}
                  >
                    Flags {sortIcon("flag_count")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedEnumerators.map((row) => (
                  <tr key={row.enumerator_id} className="border-b border-gray-100">
                    <td
                      className="py-2 px-3 font-mono text-xs font-medium text-indigo-500 cursor-pointer hover:underline"
                      onClick={() => onSelectEnumerator?.(row.enumerator_id)}
                    >
                      {row.enumerator_id}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-gray-900">{row.total_surveys}</td>
                    <td className="py-2 px-3 text-right text-gray-700">{row.active_days}</td>
                    <td className="py-2 px-3 text-right text-gray-700">{row.surveys_per_day}</td>
                    <td className="py-2 px-3 text-right text-gray-700">
                      {row.avg_duration != null ? `${row.avg_duration} min` : "\u2014"}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-600">
                      {row.first_date.slice(5)} — {row.last_date.slice(5)}
                    </td>
                    <td
                      className={`py-2 px-3 text-right${row.flag_count > 0 ? " cursor-pointer" : ""}`}
                      onClick={row.flag_count > 0 ? () => onSelectEnumerator?.(row.enumerator_id) : undefined}
                    >
                      <span className={row.flag_count > 0 ? "font-medium text-red-700 hover:underline" : "text-gray-500"}>
                        {row.flag_count}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Enumerator Patterns */}
      {enumeratorPatterns.length > 0 && (
        <div className="space-y-2">
          <div>
            <h3 className="font-semibold text-gray-800">Enumerator Patterns</h3>
            <p className="text-sm text-gray-500">
              Sorted by critical flags, then total flags. Share = enumerator's flags as % of all flags.
            </p>
          </div>
          <div className="max-h-[400px] overflow-y-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
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
                {enumeratorPatterns.map((row) => (
                  <tr key={row.enumerator_id} className="border-b border-gray-100">
                    <td className="py-3 px-3">
                      <span
                        className="font-mono text-xs font-medium text-indigo-500 cursor-pointer hover:underline"
                        onClick={() => onSelectEnumerator?.(row.enumerator_id)}
                      >
                        {row.enumerator_id}
                      </span>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warnings */}
      {performanceResult.warnings.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <p className="font-medium mb-1">Warnings</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            {performanceResult.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
