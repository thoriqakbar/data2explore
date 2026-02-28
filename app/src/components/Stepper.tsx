const STEPS = [
  { key: "import", label: "Import" },
  { key: "mapping", label: "Mapping" },
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
        return (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-0.5 w-8 ${isCompleted ? "bg-blue-500" : "bg-gray-300"}`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${
                  isCompleted
                    ? "bg-blue-500 text-white"
                    : isActive
                      ? "bg-blue-500 text-white ring-2 ring-blue-200"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {isCompleted ? "\u2713" : i + 1}
              </div>
              <span
                className={`text-sm ${isActive ? "font-semibold text-gray-900" : "text-gray-500"}`}
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
