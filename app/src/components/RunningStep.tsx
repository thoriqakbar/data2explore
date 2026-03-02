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

const STATUS_ICON: Record<Phase["status"], string> = {
  pending: "○",
  running: "⟳",
  done: "✓",
  error: "✗",
};

const STATUS_COLOR: Record<Phase["status"], string> = {
  pending: "text-gray-400",
  running: "text-blue-600",
  done: "text-green-600",
  error: "text-red-600",
};

export function RunningStep({ phases, rowCount, message }: Props) {
  // Fallback: if no phases provided, show old-style spinner
  if (!phases || phases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600 font-medium">{message ?? "Running analysis..."}</p>
        <p className="text-sm text-gray-400">This may take a moment for large datasets.</p>
      </div>
    );
  }

  const isRunning = phases.some((p) => p.status === "running");

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-6">
      {isRunning && (
        <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
      )}

      <div className="space-y-2 w-full max-w-sm">
        {phases.map((phase, i) => (
          <div key={i} className={`flex items-center gap-3 text-sm ${STATUS_COLOR[phase.status]}`}>
            <span className={`font-mono w-5 text-center ${phase.status === "running" ? "animate-spin" : ""}`}>
              {STATUS_ICON[phase.status]}
            </span>
            <span className={phase.status === "running" ? "font-medium" : ""}>
              {phase.label}
            </span>
          </div>
        ))}
      </div>

      {rowCount != null && rowCount > 0 && (
        <p className="text-sm text-gray-400">
          Running on {rowCount.toLocaleString()} rows...
        </p>
      )}
    </div>
  );
}
