export interface Phase {
  label: string;
  status: "pending" | "running" | "done" | "error";
}

interface Props {
  phases: Phase[];
  rowCount?: number;
  /** Fallback for old usage */
  message?: string;
}

const STATUS_COLOR: Record<Phase["status"], string> = {
  pending: "text-gray-300",
  running: "text-indigo-500",
  done: "text-emerald-500",
  error: "text-red-500",
};

export function RunningStep({ phases, rowCount, message }: Props) {
  // Fallback: if no phases provided, show old-style spinner
  if (!phases || phases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <span className="css-spinner css-spinner-lg" />
        <p className="text-slate-600 font-medium">{message ?? "Running analysis..."}</p>
        <p className="text-sm text-slate-400">This may take a moment for large datasets.</p>
      </div>
    );
  }

  const isRunning = phases.some((p) => p.status === "running");

  return (
    <div className="flex flex-col items-center justify-center py-14 space-y-8">
      {isRunning && (
        <span className="css-spinner css-spinner-lg" />
      )}

      <div className="space-y-3 w-full max-w-xs">
        {phases.map((phase, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 text-sm ${STATUS_COLOR[phase.status]} ${
              phase.status === "running" ? "phase-running" : ""
            }`}
          >
            {phase.status === "running" ? (
              <span className="css-spinner css-spinner-sm flex-shrink-0" />
            ) : phase.status === "done" ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 flex-shrink-0">
                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
              </svg>
            ) : phase.status === "error" ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 flex-shrink-0">
                <path fillRule="evenodd" d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06L8 9.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L9.06 8l3.72-3.72a.75.75 0 0 0-1.06-1.06L8 6.94 4.28 3.22Z" clipRule="evenodd" />
              </svg>
            ) : (
              <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
              </span>
            )}
            <span className={phase.status === "running" ? "font-medium" : ""}>
              {phase.label}
            </span>
          </div>
        ))}
      </div>

      {rowCount != null && rowCount > 0 && (
        <p className="text-xs text-slate-400 tabular-nums">
          Processing {rowCount.toLocaleString()} rows
        </p>
      )}
    </div>
  );
}
