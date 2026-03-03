import { useState } from "react";
import type { ProfileOutput, RecentProject } from "../../../shared/index";

interface Props {
  filePath: string | null;
  profileResult: ProfileOutput | null;
  error: string | null;
  onSelectFile: () => void;
  onLoadSample?: () => void;
  recentProjects?: RecentProject[];
  onOpenRecent?: (filePath: string) => void;
  onRemoveRecent?: (filePath: string) => void;
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const FLOW_STEPS = ["Import", "Map", "Rules", "Run", "Results"];
const FORMAT_BADGES = ["CSV", "XLSX", "Stata (.dta)", "TXT"];

export function ImportStep({ filePath, profileResult, error, onSelectFile, onLoadSample, recentProjects, onOpenRecent, onRemoveRecent }: Props) {
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

      {recentProjects && recentProjects.length > 0 && !isLoading && !profileResult && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Recent projects</p>
          <div className="space-y-1.5">
            {recentProjects.map((project) => (
              <button
                key={project.filePath}
                onClick={() => onOpenRecent?.(project.filePath)}
                className="w-full text-left group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-slate-700 truncate">{project.fileName}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {project.rowCount.toLocaleString()} rows, {project.colCount} cols
                    <span className="mx-1.5">·</span>
                    {formatRelativeDate(project.lastRunAt)}
                  </p>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onRemoveRecent?.(project.filePath); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onRemoveRecent?.(project.filePath); } }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-slate-500 transition-opacity"
                  title="Remove from recent"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                  </svg>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
