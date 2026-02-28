import { useState, useCallback } from "react";
import type { MappingConfig, ProfileOutput, SummaryOutput } from "../../shared/index";
import { Stepper } from "./components/Stepper";
import { ImportStep } from "./components/ImportStep";
import { MappingStep } from "./components/MappingStep";
import { RunningStep } from "./components/RunningStep";
import { ResultsStep } from "./components/ResultsStep";

type Step = "import" | "mapping" | "running" | "results";

const MAPPING_FIELDS: (keyof MappingConfig)[] = [
  "id",
  "enumerator_id",
  "survey_date",
  "module"
];

function autoGuessMapping(columns: string[]): MappingConfig {
  const mapping: MappingConfig = { id: "", enumerator_id: "", survey_date: "" };
  const lowerMap = new Map(columns.map((c) => [c.toLowerCase(), c]));
  for (const field of MAPPING_FIELDS) {
    const match = lowerMap.get(field.toLowerCase());
    if (match) mapping[field] = match;
  }
  return mapping;
}

export function App() {
  const [step, setStep] = useState<Step>("import");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [profileResult, setProfileResult] = useState<ProfileOutput | null>(null);
  const [mapping, setMapping] = useState<MappingConfig>({
    id: "",
    enumerator_id: "",
    survey_date: "",
    module: ""
  });
  const [summaryResult, setSummaryResult] = useState<SummaryOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelectFile = useCallback(async () => {
    setError(null);
    try {
      const selected = await window.d2e.selectFile();
      if (!selected) return;

      setFilePath(selected);
      setProfileResult(null);

      // Auto-run profile
      const tempOut = selected + ".d2e-profile.json";
      const result = await window.d2e.runEngine({
        command: "profile",
        input: selected,
        out: tempOut
      });

      if (!result.ok) {
        setError(result.stderr || "Profile failed.");
        return;
      }

      const profile = result.data as ProfileOutput;
      setProfileResult(profile);

      // Auto-guess mapping from column names
      const columnNames = profile.schema_profile.columns.map((c) => c.name);
      setMapping(autoGuessMapping(columnNames));
      setStep("mapping");
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setError(`Failed to select file: ${msg}`);
    }
  }, []);

  const handleConfirmMapping = useCallback(async () => {
    if (!filePath) return;
    setStep("running");
    setError(null);

    try {
      // Strip undefined optional fields before writing
      const cleanMapping = Object.fromEntries(
        Object.entries(mapping).filter(([, v]) => v !== undefined && v !== "")
      );
      const mappingPath = await window.d2e.writeTempMapping(cleanMapping);
      const tempOut = filePath + ".d2e-summary.json";

      const result = await window.d2e.runEngine({
        command: "summarize",
        input: filePath,
        mapping: mappingPath,
        out: tempOut
      });

      if (!result.ok) {
        setError(result.stderr || "Summary failed.");
        setStep("mapping");
        return;
      }

      setSummaryResult(result.data as SummaryOutput);
      setStep("results");
    } catch (err) {
      setError(String(err));
      setStep("mapping");
    }
  }, [filePath, mapping]);

  const handleStartOver = useCallback(() => {
    setStep("import");
    setFilePath(null);
    setProfileResult(null);
    setMapping({ id: "", enumerator_id: "", survey_date: "" });
    setSummaryResult(null);
    setError(null);
  }, []);

  return (
    <main className="max-w-3xl mx-auto my-8 px-6 py-8 bg-white rounded-xl shadow-lg">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">data2explore</h1>
        <p className="text-sm text-gray-500 mt-1">
          High-frequency checks for survey data quality
        </p>
      </header>

      <Stepper currentStep={step} />

      {step === "import" && (
        <ImportStep
          filePath={filePath}
          profileResult={profileResult}
          error={error}
          onSelectFile={handleSelectFile}
        />
      )}

      {step === "mapping" && profileResult && (
        <MappingStep
          profileResult={profileResult}
          mapping={mapping}
          onMappingChange={setMapping}
          onConfirm={handleConfirmMapping}
          onBack={() => setStep("import")}
        />
      )}

      {step === "running" && <RunningStep />}

      {step === "results" && profileResult && summaryResult && (
        <ResultsStep
          profileResult={profileResult}
          summaryResult={summaryResult}
          onStartOver={handleStartOver}
        />
      )}

      {step !== "import" && error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <p className="font-medium mb-1">Error</p>
          <pre className="whitespace-pre-wrap text-xs">{error}</pre>
        </div>
      )}
    </main>
  );
}
