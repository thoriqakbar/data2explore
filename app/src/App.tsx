import { useState, useCallback } from "react";
import type { MappingConfig, ProfileOutput, SummaryOutput, CheckOutput, RangeRule } from "../../shared/index";
import { Stepper } from "./components/Stepper";
import { ImportStep } from "./components/ImportStep";
import { MappingStep } from "./components/MappingStep";
import { RulesStep } from "./components/RulesStep";
import { RunningStep } from "./components/RunningStep";
import { ResultsStep } from "./components/ResultsStep";

type Step = "import" | "mapping" | "rules" | "running" | "results";

const MAPPING_FIELDS: (keyof MappingConfig)[] = [
  "id",
  "enumerator_id",
  "survey_date",
  "module"
];

function autoGuessMapping(columns: string[]): MappingConfig {
  const mapping: MappingConfig = {};
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
  const [mapping, setMapping] = useState<MappingConfig>({});
  const [summaryResult, setSummaryResult] = useState<SummaryOutput | null>(null);
  const [checkResult, setCheckResult] = useState<CheckOutput | null>(null);
  const [rangeRules, setRangeRules] = useState<RangeRule[]>([]);
  const [runningMessage, setRunningMessage] = useState("Running summary analysis...");
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

  const handleConfirmMapping = useCallback(() => {
    setStep("rules");
  }, []);

  const handleRunAnalysis = useCallback(async () => {
    if (!filePath) return;
    setStep("running");
    setError(null);
    setRunningMessage("Running summary analysis...");

    try {
      // Strip undefined optional fields before writing
      const cleanMapping = Object.fromEntries(
        Object.entries(mapping).filter(([, v]) => v !== undefined && v !== "")
      );
      const mappingPath = await window.d2e.writeTempMapping(cleanMapping);

      // Write config with range rules if any are defined
      let configPath: string | undefined;
      if (rangeRules.length > 0) {
        configPath = await window.d2e.writeTempConfig({ range_rules: rangeRules });
      }

      // Phase 1: Summarize
      const tempOut = filePath + ".d2e-summary.json";
      const sumResult = await window.d2e.runEngine({
        command: "summarize",
        input: filePath,
        mapping: mappingPath,
        out: tempOut
      });

      if (!sumResult.ok) {
        setError(sumResult.stderr || "Summary failed.");
        setStep("rules");
        return;
      }
      setSummaryResult(sumResult.data as SummaryOutput);

      // Phase 2: Check
      setRunningMessage("Running HFC checks...");
      const outDir = filePath + ".d2e-checks";
      const chkResult = await window.d2e.runEngine({
        command: "check",
        input: filePath,
        mapping: mappingPath,
        config: configPath,
        outDir
      });

      if (chkResult.ok && chkResult.data) {
        const data = chkResult.data as { flags: CheckOutput["flags"]; summary: CheckOutput["summary"] };
        setCheckResult({ ok: true, flags: data.flags, summary: data.summary });
      } else {
        // Non-fatal: show results without checks
        setCheckResult(null);
      }

      setStep("results");
    } catch (err) {
      setError(String(err));
      setStep("rules");
    }
  }, [filePath, mapping, rangeRules]);

  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const handleExportReport = useCallback(async () => {
    if (!profileResult || !summaryResult || !filePath) return;
    setExporting(true);
    setExportMessage(null);
    try {
      // Build combined report data from current state
      const reportData = {
        profile: profileResult.schema_profile,
        summary_stats: summaryResult.summary_stats,
        check_summary: checkResult?.summary ?? { run_id: "", total_flags: 0, by_severity: {}, by_check: {}, skipped_checks: [] },
        flags: checkResult?.flags ?? [],
        run_metadata: {
          dataset_path: filePath,
          timestamp: new Date().toISOString(),
          engine_version: "0.1.0",
        },
        mapping,
      };

      // Write combined JSON to temp file
      const tempPath = await window.d2e.writeTempMapping(reportData as unknown as Record<string, string>);

      // Show save dialog
      const fileName = filePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") ?? "d2e";
      const savePath = await window.d2e.saveFile(`${fileName}-hfc-report.xlsx`);
      if (!savePath) {
        setExporting(false);
        return;
      }

      // Generate report via engine
      const result = await window.d2e.runEngine({
        command: "report",
        data: tempPath,
        out: savePath,
      });

      if (result.ok) {
        setExportMessage(`Report saved to ${savePath}`);
      } else {
        setExportMessage(`Export failed: ${result.stderr}`);
      }
    } catch (err) {
      setExportMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  }, [filePath, profileResult, summaryResult, checkResult, mapping]);

  const handleStartOver = useCallback(() => {
    setStep("import");
    setFilePath(null);
    setProfileResult(null);
    setMapping({});
    setRangeRules([]);
    setSummaryResult(null);
    setCheckResult(null);
    setError(null);
    setExportMessage(null);
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

      {step === "rules" && profileResult && (
        <RulesStep
          profileResult={profileResult}
          rangeRules={rangeRules}
          onRulesChange={setRangeRules}
          onConfirm={handleRunAnalysis}
          onBack={() => setStep("mapping")}
        />
      )}

      {step === "running" && <RunningStep message={runningMessage} />}

      {step === "results" && profileResult && summaryResult && (
        <>
          <ResultsStep
            profileResult={profileResult}
            summaryResult={summaryResult}
            checkResult={checkResult}
            onStartOver={handleStartOver}
            onExportReport={handleExportReport}
            exporting={exporting}
          />
          {exportMessage && (
            <div className={`mt-4 p-3 rounded-lg text-sm ${
              exportMessage.startsWith("Report saved")
                ? "bg-green-50 border border-green-200 text-green-800"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {exportMessage}
            </div>
          )}
        </>
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
