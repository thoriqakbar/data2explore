import { useMemo, useState } from "react";
import type { CheckOutput, PerformanceOutput } from "../../../../shared/index";
import { categoryForCheckId } from "../results/problemReview";

interface Props {
  checkResult: CheckOutput | null | undefined;
  performanceResult: PerformanceOutput | null | undefined;
  onNavigateToPerformance?: () => void;
}

type ProblemRow = {
  category: string;
  count: number;
  severity: "critical" | "warning" | "info";
  topColumn: string | null;
};

type EnumeratorRiskRow = {
  enumerator_id: string;
  total_surveys: number;
  flag_count: number;
  flag_rate: number;
  flaggedByCHK009: boolean;
};

// Categories where "top column" doesn't make sense
const SKIP_TOP_COLUMN = new Set(["Duplicate / ID", "Enumerator Risk"]);
// Categories to exclude from Top Problems entirely (shown elsewhere)
const EXCLUDE_CATEGORIES = new Set(["Enumerator Risk"]);

export function OverviewTab({ checkResult, performanceResult, onNavigateToPerformance }: Props) {
  const [showAllEnumerators, setShowAllEnumerators] = useState(false);

  // Derive top problems: group by_check counts into categories, merge duplicates
  const topProblems = useMemo<ProblemRow[]>(() => {
    if (!checkResult) return [];
    const byCheck = checkResult.summary.by_check;
    const categoryMap = new Map<string, { count: number; severity: "critical" | "warning" | "info"; columnCounts: Map<string, number> }>();

    // Determine dominant severity per check from flags
    const checkSeverity = new Map<string, string>();
    for (const flag of checkResult.flags) {
      const existing = checkSeverity.get(flag.check_id);
      if (!existing || flag.severity.toLowerCase() === "critical") {
        checkSeverity.set(flag.check_id, flag.severity.toLowerCase());
      }
    }

    for (const [checkId, count] of Object.entries(byCheck)) {
      const category = categoryForCheckId(checkId);
      if (EXCLUDE_CATEGORIES.has(category)) continue;
      const existing = categoryMap.get(category);
      const sev = (checkSeverity.get(checkId) ?? "info") as "critical" | "warning" | "info";
      if (existing) {
        existing.count += count;
        if (sev === "critical") existing.severity = "critical";
        else if (sev === "warning" && existing.severity !== "critical") existing.severity = "warning";
      } else {
        categoryMap.set(category, { count, severity: sev, columnCounts: new Map() });
      }
    }

    // Count columns per category from raw flags
    for (const flag of checkResult.flags) {
      const category = categoryForCheckId(flag.check_id);
      if (EXCLUDE_CATEGORIES.has(category) || SKIP_TOP_COLUMN.has(category)) continue;
      const entry = categoryMap.get(category);
      if (entry && flag.column_name) {
        entry.columnCounts.set(flag.column_name, (entry.columnCounts.get(flag.column_name) ?? 0) + 1);
      }
    }

    return [...categoryMap.entries()]
      .map(([category, { count, severity, columnCounts }]) => {
        let topColumn: string | null = null;
        if (columnCounts.size > 0) {
          topColumn = [...columnCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        }
        return { category, count, severity, topColumn };
      })
      .sort((a, b) => b.count - a.count);
  }, [checkResult]);

  // Enumerator risk ranking: merge performance stats with check data
  const enumeratorRisk = useMemo<EnumeratorRiskRow[]>(() => {
    if (!performanceResult?.enumerator_stats) return [];
    const byEnumerator = checkResult?.summary?.by_enumerator ?? {};

    // Check which enumerators are flagged by CHK-009
    const chk009Enumerators = new Set<string>();
    if (checkResult?.flags) {
      for (const flag of checkResult.flags) {
        if (flag.check_id === "CHK-009") {
          chk009Enumerators.add(flag.enumerator_id);
        }
      }
    }

    return performanceResult.enumerator_stats
      .map((stat) => {
        const flagCount = byEnumerator[stat.enumerator_id] ?? 0;
        return {
          enumerator_id: stat.enumerator_id,
          total_surveys: stat.total_surveys,
          flag_count: flagCount,
          flag_rate: stat.total_surveys > 0 ? flagCount / stat.total_surveys : 0,
          flaggedByCHK009: chk009Enumerators.has(stat.enumerator_id),
        };
      })
      .sort((a, b) => b.flag_rate - a.flag_rate || b.flag_count - a.flag_count);
  }, [performanceResult, checkResult]);

  const visibleEnumerators = showAllEnumerators ? enumeratorRisk : enumeratorRisk.slice(0, 5);
  const hasMoreEnumerators = enumeratorRisk.length > 5;

  // Guard: need check results for meaningful overview
  if (!checkResult) {
    return (
      <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 text-center">
        Run data quality checks to see the overview.
      </div>
    );
  }

  const totalFlags = checkResult.summary.total_flags;
  const criticalCount = checkResult.summary.by_severity["critical"] ?? checkResult.summary.by_severity["Critical"] ?? 0;
  const warningCount = checkResult.summary.by_severity["warning"] ?? checkResult.summary.by_severity["Warning"] ?? 0;
  const surveysChecked = performanceResult?.totals?.total_surveys ?? "—";

  return (
    <div className="space-y-6">
      {/* Key Numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
          <p className="text-2xl font-bold text-gray-900">{totalFlags.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Flags</p>
        </div>
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
          <p className="text-2xl font-bold text-red-700">{criticalCount.toLocaleString()}</p>
          <p className="text-xs text-red-600 mt-0.5">Critical</p>
        </div>
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
          <p className="text-2xl font-bold text-amber-700">{warningCount.toLocaleString()}</p>
          <p className="text-xs text-amber-600 mt-0.5">Warning</p>
        </div>
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
          <p className="text-2xl font-bold text-gray-900">{typeof surveysChecked === "number" ? surveysChecked.toLocaleString() : surveysChecked}</p>
          <p className="text-xs text-gray-500 mt-0.5">Surveys Checked</p>
        </div>
      </div>

      {/* Top Problems */}
      {topProblems.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-gray-800">Top Problems</h3>
          <div className="space-y-1.5">
            {topProblems.map((problem) => (
              <div
                key={problem.category}
                className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-200 rounded-lg"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                      problem.severity === "critical"
                        ? "bg-red-500"
                        : problem.severity === "warning"
                          ? "bg-amber-500"
                          : "bg-blue-400"
                    }`}
                  />
                  <span className="text-sm font-medium text-gray-800">{problem.category}</span>
                  {problem.topColumn && (
                    <span className="text-xs text-gray-400 truncate">
                      top: <span className="font-mono text-gray-500">{problem.topColumn}</span>
                    </span>
                  )}
                </div>
                <span className="text-sm tabular-nums text-gray-600 flex-shrink-0 ml-3">
                  {problem.count.toLocaleString()} {problem.count === 1 ? "flag" : "flags"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enumerator Risk Ranking */}
      {enumeratorRisk.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-gray-800">Enumerator Risk Ranking</h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Enumerator ID</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Surveys</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Flags</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Flag Rate</th>
                </tr>
              </thead>
              <tbody>
                {visibleEnumerators.map((row) => (
                  <tr
                    key={row.enumerator_id}
                    className={`border-b border-gray-100 ${row.flaggedByCHK009 ? "bg-red-50" : ""}`}
                  >
                    <td className="py-2 px-3">
                      <span className="font-mono text-xs font-medium text-gray-900">
                        {row.enumerator_id}
                      </span>
                      {row.flaggedByCHK009 && (
                        <span className="ml-1.5 text-[10px] font-medium text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                          CHK-009
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-700">{row.total_surveys}</td>
                    <td className="py-2 px-3 text-right">
                      <span className={row.flag_count > 0 ? "font-medium text-red-700" : "text-gray-500"}>
                        {row.flag_count}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-700">
                      {row.flag_rate.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-4">
            {hasMoreEnumerators && (
              <button
                onClick={() => setShowAllEnumerators((v) => !v)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {showAllEnumerators
                  ? "Show top 5"
                  : `Show all (${enumeratorRisk.length} enumerators)`}
              </button>
            )}
            {onNavigateToPerformance && (
              <button
                onClick={onNavigateToPerformance}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                View details in Performance &rarr;
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
