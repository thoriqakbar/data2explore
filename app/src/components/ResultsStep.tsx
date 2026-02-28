import type { ProfileOutput, SummaryOutput } from "../../../shared/index";

interface Props {
  profileResult: ProfileOutput;
  summaryResult: SummaryOutput;
  onStartOver: () => void;
}

export function ResultsStep({ profileResult, summaryResult, onStartOver }: Props) {
  const { schema_profile } = profileResult;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Results</h2>
        <p className="text-sm text-gray-500">
          Profile overview and summary statistics for your dataset.
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
                    {row.mean != null ? row.mean.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {row.std_dev != null ? row.std_dev.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {row.min != null ? row.min.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 text-right">
                    {row.max != null ? row.max.toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button
        onClick={onStartOver}
        className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm transition-colors"
      >
        Start Over
      </button>
    </div>
  );
}
