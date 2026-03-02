import { useState } from "react";
import type { ProfileOutput } from "../../../shared/index";

interface Props {
  filePath: string | null;
  profileResult: ProfileOutput | null;
  error: string | null;
  onSelectFile: () => void;
  onLoadSample?: () => void;
}

const FLOW_STEPS = ["Import", "Map", "Rules", "Run", "Results"];
const FORMAT_BADGES = ["CSV", "XLSX", "Stata (.dta)", "TXT"];

export function ImportStep({ filePath, profileResult, error, onSelectFile, onLoadSample }: Props) {
  const isLoading = filePath !== null && profileResult === null && error === null;
  const fileName = filePath ? filePath.split(/[\\/]/).pop() : null;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Import Data</h2>
        <p className="text-sm text-gray-500">
          Select a survey data file to get started.
        </p>
      </div>

      {/* How it works mini-flow */}
      <div className="flex items-center gap-1 text-xs text-gray-400">
        {FLOW_STEPS.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            <span className={i === 0 ? "text-blue-600 font-semibold" : ""}>{s}</span>
            {i < FLOW_STEPS.length - 1 && <span className="text-gray-300">→</span>}
          </span>
        ))}
      </div>

      {/* Format badges */}
      <div className="flex gap-2">
        {FORMAT_BADGES.map((fmt) => (
          <span
            key={fmt}
            className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500 border border-gray-200"
          >
            {fmt}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onSelectFile}
          disabled={isLoading}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
        >
          {isLoading ? "Profiling..." : "Select File"}
        </button>

        {onLoadSample && !filePath && (
          <button
            onClick={onLoadSample}
            className="text-sm text-blue-600 hover:text-blue-700 hover:underline transition-colors"
          >
            Try with sample data
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Running profile on {fileName}...
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <p className="font-medium mb-1">Error</p>
          <pre className="whitespace-pre-wrap text-xs">{error}</pre>
        </div>
      )}

      {profileResult && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-medium text-green-800 mb-2">{fileName}</p>
          <div className="flex gap-6 text-sm text-green-700 mb-2">
            <span>{profileResult.schema_profile.row_count.toLocaleString()} rows</span>
            <span>{profileResult.schema_profile.column_count} columns</span>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-green-600 hover:text-green-700 hover:underline"
          >
            {expanded ? "Hide columns" : "Show columns"}
          </button>
          {expanded && (
            <div className="mt-2 max-h-48 overflow-y-auto text-xs text-green-700 space-y-0.5">
              {profileResult.schema_profile.columns.map((col) => (
                <div key={col.name} className="flex gap-2">
                  <span className="font-mono">{col.name}</span>
                  <span className="text-green-500">({col.dtype})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
