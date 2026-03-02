interface Props {
  type: "file" | "mapping" | "engine" | "unknown";
  message: string;
  suggestion?: string;
  onAction?: () => void;
  actionLabel?: string;
}

const LABELS: Record<Props["type"], string> = {
  file: "File Error",
  mapping: "Mapping Error",
  engine: "Engine Error",
  unknown: "Error",
};

const COLORS: Record<Props["type"], string> = {
  file: "bg-red-50 border-red-200 text-red-800",
  mapping: "bg-amber-50 border-amber-200 text-amber-800",
  engine: "bg-red-50 border-red-200 text-red-800",
  unknown: "bg-red-50 border-red-200 text-red-700",
};

export function ErrorBanner({ type, message, suggestion, onAction, actionLabel }: Props) {
  return (
    <div className={`p-4 border rounded-lg ${COLORS[type]}`}>
      <p className="font-medium text-sm mb-1">{LABELS[type]}</p>
      <pre className="whitespace-pre-wrap text-xs mb-2">{message}</pre>
      {suggestion && (
        <p className="text-xs opacity-80">{suggestion}</p>
      )}
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          className="mt-2 px-3 py-1.5 text-xs font-medium rounded-md bg-white border border-current opacity-80 hover:opacity-100 transition-opacity"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function classifyError(stderr: string): { type: Props["type"]; message: string; suggestion: string } {
  const lower = stderr.toLowerCase();

  if (lower.includes("no such file") || lower.includes("filenotfounderror") || lower.includes("permission denied")) {
    return {
      type: "file",
      message: stderr,
      suggestion: "Check that the file exists and is not open in another program.",
    };
  }
  if (lower.includes("mapping") || lower.includes("missing required") || lower.includes("not found in data")) {
    return {
      type: "mapping",
      message: stderr,
      suggestion: "Go back to the Mapping step and verify your column assignments.",
    };
  }
  if (lower.includes("traceback") || lower.includes("error") || lower.includes("exception")) {
    return {
      type: "engine",
      message: stderr,
      suggestion: "This may be a bug. Try re-running or check the engine logs.",
    };
  }
  return {
    type: "unknown",
    message: stderr,
    suggestion: "An unexpected error occurred.",
  };
}
