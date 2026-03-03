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
      {/* How it works mini-flow */}
      <div className="flow-enter flex items-center gap-1.5 text-xs text-gray-400">
        {FLOW_STEPS.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={i === 0 ? "flow-step-active font-semibold" : ""}>{s}</span>
            {i < FLOW_STEPS.length - 1 && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5 text-gray-300">
                <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            )}
          </span>
        ))}
      </div>

      {/* Format badges */}
      <div className="flex gap-2">
        {FORMAT_BADGES.map((fmt, i) => (
          <span
            key={fmt}
            className="format-badge px-2.5 py-0.5 text-xs rounded-full text-slate-500 font-medium"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {fmt}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onSelectFile}
          disabled={isLoading}
          className="btn-primary px-5 py-2.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isLoading ? "Profiling..." : "Select File"}
        </button>

        {onLoadSample && !filePath && (
          <button
            onClick={onLoadSample}
            className="cta-sample text-sm text-indigo-600 font-medium bg-indigo-50 border border-indigo-200 rounded-full px-4 py-1.5"
          >
            Try with sample data <span className="cta-arrow">→</span>
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span className="css-spinner css-spinner-md" />
          Running profile on <span className="font-mono text-xs">{fileName}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <p className="font-medium mb-1">Error</p>
          <pre className="whitespace-pre-wrap text-xs">{error}</pre>
        </div>
      )}

      {profileResult && (
        <div className="profile-card p-4 rounded-lg">
          <p className="text-sm font-medium text-indigo-800 mb-2">{fileName}</p>
          <div className="flex gap-6 text-sm text-indigo-700 mb-2">
            <span><strong className="tabular-nums">{profileResult.schema_profile.row_count.toLocaleString()}</strong> rows</span>
            <span><strong className="tabular-nums">{profileResult.schema_profile.column_count}</strong> columns</span>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
          >
            {expanded ? "Hide columns ↑" : "Show columns ↓"}
          </button>
          {expanded && (
            <div className="mt-2 max-h-48 overflow-y-auto text-xs text-indigo-700 space-y-0.5">
              {profileResult.schema_profile.columns.map((col) => (
                <div key={col.name} className="flex gap-2">
                  <span className="font-mono">{col.name}</span>
                  <span className="text-indigo-400">({col.dtype})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
