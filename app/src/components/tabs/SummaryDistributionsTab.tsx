import { useState } from "react";
import type { ProfileOutput, SummaryOutput } from "../../../../shared/index";
import { VariableHistogramChart } from "../charts/VariableHistogramChart";

interface Props {
  profileResult: ProfileOutput;
  summaryResult: SummaryOutput;
}

const PERCENTILE_LABELS: Record<string, string> = {
  p5: "P5",
  p10: "P10",
  p25: "P25",
  p50: "Median",
  p75: "P75",
  p90: "P90",
  p95: "P95",
};

export function SummaryDistributionsTab({ profileResult, summaryResult }: Props) {
  const { schema_profile } = profileResult;
  const [selectedVariable, setSelectedVariable] = useState<string | null>(null);

  const selectedRow = summaryResult.summary_stats.find((r) => r.variable === selectedVariable);

  return (
    <div className="space-y-6">
      {/* Profile Overview */}
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
          <div className="overflow-x-auto overflow-y-auto max-h-72 rounded">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 z-10">
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

      {/* Summary Statistics */}
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-gray-800">Summary Statistics</h3>
          <p className="text-sm text-gray-500">Click a variable to view its distribution.</p>
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-96 rounded">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
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
                <tr
                  key={row.variable}
                  onClick={() => setSelectedVariable(selectedVariable === row.variable ? null : row.variable)}
                  className={`border-b border-gray-100 cursor-pointer transition-colors ${
                    selectedVariable === row.variable
                      ? "bg-indigo-50"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <td className="py-2 pr-4 font-mono text-xs">
                    {row.variable}
                    {(row.histogram || row.discrete_distribution) && (
                      <span className="ml-1.5 text-indigo-400 text-[10px]">
                        {selectedVariable === row.variable ? "\u25BC" : "\u25B6"}
                      </span>
                    )}
                  </td>
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

      {/* Expanded variable detail */}
      {selectedRow && (selectedRow.histogram || selectedRow.discrete_distribution) && (
        <div className="p-4 bg-indigo-50/50 border border-indigo-200 rounded-lg space-y-4">
          <h4 className="font-semibold text-gray-800 text-sm">
            Distribution: <span className="font-mono">{selectedRow.variable}</span>
          </h4>

          <VariableHistogramChart
            histogram={selectedRow.histogram}
            discreteDistribution={selectedRow.discrete_distribution}
            distributionType={selectedRow.distribution_type}
            mean={selectedRow.mean}
            label={selectedRow.variable}
          />

          {selectedRow.percentiles && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {Object.entries(selectedRow.percentiles).map(([key, value]) => (
                <div key={key} className="flex items-baseline gap-1.5">
                  <span className="text-gray-500 text-xs">{PERCENTILE_LABELS[key] ?? key}</span>
                  <span className="font-medium text-gray-900">{value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
