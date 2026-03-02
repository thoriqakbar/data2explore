const STEPS = [
  { key: "import", label: "Import" },
  { key: "mapping", label: "Mapping" },
  { key: "rules", label: "Rules" },
  { key: "running", label: "Running" },
  { key: "results", label: "Results" }
] as const;

type Step = (typeof STEPS)[number]["key"];

export function Stepper({ currentStep }: { currentStep: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <nav className="flex items-center gap-2 mb-8">
      {STEPS.map((s, i) => {
        const isCompleted = i < currentIndex;
        const isActive = i === currentIndex;
        const isFuture = i > currentIndex;
        return (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-0.5 w-8 stepper-line ${isCompleted ? "bg-indigo-500" : "bg-gray-200"}`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`stepper-dot w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                  isCompleted
                    ? "bg-indigo-500 text-white shadow-sm shadow-indigo-200"
                    : isActive
                      ? "bg-indigo-500 text-white ring-2 ring-indigo-200 shadow-sm shadow-indigo-200"
                      : "bg-gray-100 text-gray-400 border border-gray-200"
                }${isFuture ? " stepper-dot-future" : ""}`}
              >
                {isCompleted ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                  </svg>
                ) : i + 1}
              </div>
              <span
                className={`text-sm tracking-tight ${
                  isActive ? "font-semibold text-slate-800" : isCompleted ? "text-slate-600" : "text-gray-400"
                }`}
              >
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
