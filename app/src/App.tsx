import { useCallback, useState } from "react";
import type {
  AllowedValuesRule,
  CheckOutput,
  DurationMapping,
  MappingConfig,
  PerformanceOutput,
  ProfileOutput,
  ProjectConfig,
  RangeRule,
  RunMetadata,
  SummaryOutput,
} from "../../shared/index";
import { Stepper } from "./components/Stepper";
import { ImportStep } from "./components/ImportStep";
import { MappingStep } from "./components/MappingStep";
import { RulesStep } from "./components/RulesStep";
import { RunningStep } from "./components/RunningStep";
import type { Phase } from "./components/RunningStep";
import { ResultsStep } from "./components/ResultsStep";
import { ErrorBanner, classifyError } from "./components/ErrorBanner";

type Step = "import" | "mapping" | "rules" | "running" | "results";

type RunContext = {
  lastCheckOutDir: string | null;
  lastConfigSnapshot: ProjectConfig | null;
};

type LoadedProjectConfig = {
  config: ProjectConfig;
  warning: string | null;
};

const APP_VERSION = "0.1.0";

const MAPPING_FIELDS: (keyof MappingConfig)[] = [
  "id",
  "enumerator_id",
  "survey_date",
  "module",
];

const MAPPING_ALIASES: Record<keyof MappingConfig, string[]> = {
  id: ["id", "resp_id", "respondent_id", "response_id", "record_id", "uid", "unique_id", "key", "_id", "submission_id"],
  enumerator_id: ["enumerator_id", "interviewer_id", "enum_id", "enumerator", "interviewer", "collector_id", "agent_id"],
  survey_date: ["survey_date", "date", "interview_date", "submission_date", "created_date", "start_date", "datetime", "timestamp"],
  module: ["module", "section", "form", "form_name", "questionnaire"],
};

const DEFAULT_DURATION: DurationMapping = { mode: "none" };

function autoGuessMapping(columns: string[]): MappingConfig {
  const mapping: MappingConfig = {};
  const lowerMap = new Map(columns.map((c) => [c.toLowerCase(), c]));
  for (const field of MAPPING_FIELDS) {
    for (const alias of MAPPING_ALIASES[field]) {
      const match = lowerMap.get(alias.toLowerCase());
      if (match) {
        mapping[field] = match;
        break;
      }
    }
  }
  return mapping;
}

function autoGuessDuration(columns: string[]): DurationMapping {
  const lower = new Map(columns.map((c) => [c.toLowerCase(), c]));

  // Try column mode first
  for (const name of ["duration_minutes", "duration", "interview_duration", "duration_min"]) {
    const match = lower.get(name);
    if (match) return { mode: "column", duration_column: match, duration_unit: "minutes" };
  }
  for (const name of ["duration_seconds", "duration_sec"]) {
    const match = lower.get(name);
    if (match) return { mode: "column", duration_column: match, duration_unit: "seconds" };
  }

  // Try start_end mode
  const startNames = ["start_time", "starttime", "start", "begin_time"];
  const endNames = ["end_time", "endtime", "end", "finish_time"];
  for (const s of startNames) {
    const startMatch = lower.get(s);
    if (startMatch) {
      for (const e of endNames) {
        const endMatch = lower.get(e);
        if (endMatch) return { mode: "start_end", start_column: startMatch, end_column: endMatch };
      }
    }
  }

  return { mode: "none" };
}

function sanitizeLoadedConfig(raw: unknown, profileResult: ProfileOutput | null): LoadedProjectConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error("Configuration file must contain a JSON object.");
  }

  const candidate = raw as {
    version?: unknown;
    mapping?: unknown;
    duration?: unknown;
    range_rules?: unknown;
    allowed_values_rules?: unknown;
    excluded_columns?: unknown;
    enabled_checks?: unknown;
  };

  if (candidate.version !== "1") {
    throw new Error("Unsupported configuration version.");
  }

  const columns = new Set(profileResult?.schema_profile.columns.map((column) => column.name) ?? []);
  const numericColumns = new Set(
    (profileResult?.schema_profile.columns ?? [])
      .filter((column) => /int|float/.test(column.dtype))
      .map((column) => column.name)
  );

  const warnings: string[] = [];
  const mappingInput = candidate.mapping && typeof candidate.mapping === "object"
    ? candidate.mapping as Record<string, unknown>
    : {};

  const mapping: MappingConfig = {};
  for (const field of MAPPING_FIELDS) {
    const value = mappingInput[field];
    if (typeof value !== "string" || value.trim() === "") continue;
    if (columns.size > 0 && !columns.has(value)) {
      warnings.push(`Dropped mapping for "${field}" because column "${value}" is missing in this dataset.`);
      continue;
    }
    mapping[field] = value;
  }

  const rulesInput = Array.isArray(candidate.range_rules) ? candidate.range_rules : [];
  const range_rules: RangeRule[] = [];
  for (const rule of rulesInput) {
    if (!rule || typeof rule !== "object") continue;
    const record = rule as Record<string, unknown>;
    const column = typeof record.column === "string" ? record.column : "";
    if (!column) continue;
    if (columns.size > 0 && !columns.has(column)) {
      warnings.push(`Dropped range rule for "${column}" because the column is missing in this dataset.`);
      continue;
    }
    if (numericColumns.size > 0 && !numericColumns.has(column)) {
      warnings.push(`Dropped range rule for "${column}" because it is not numeric in this dataset.`);
      continue;
    }
    const min = typeof record.min === "number" ? record.min : null;
    const max = typeof record.max === "number" ? record.max : null;
    range_rules.push({ column, min, max });
  }

  // Allowed values rules
  const avInput = Array.isArray(candidate.allowed_values_rules) ? candidate.allowed_values_rules : [];
  const allowed_values_rules: AllowedValuesRule[] = [];
  for (const rule of avInput) {
    if (!rule || typeof rule !== "object") continue;
    const record = rule as Record<string, unknown>;
    const column = typeof record.column === "string" ? record.column : "";
    if (!column) continue;
    if (columns.size > 0 && !columns.has(column)) {
      warnings.push(`Dropped allowed-values rule for "${column}" because the column is missing in this dataset.`);
      continue;
    }
    const values = Array.isArray(record.values) ? record.values.map(String) : [];
    allowed_values_rules.push({ column, values });
  }

  // Excluded columns
  const exInput = Array.isArray(candidate.excluded_columns) ? candidate.excluded_columns : [];
  const excluded_columns: string[] = [];
  for (const col of exInput) {
    if (typeof col !== "string") continue;
    if (columns.size > 0 && !columns.has(col)) continue;
    excluded_columns.push(col);
  }

  // Enabled checks
  const enabled_checks = Array.isArray(candidate.enabled_checks)
    ? candidate.enabled_checks.filter((c): c is string => typeof c === "string")
    : undefined;

  // Duration mapping
  let duration: DurationMapping | undefined;
  if (candidate.duration && typeof candidate.duration === "object") {
    const d = candidate.duration as Record<string, unknown>;
    const mode = d.mode;
    if (mode === "column" || mode === "start_end" || mode === "none") {
      duration = { mode } as DurationMapping;
      if (typeof d.duration_column === "string") duration.duration_column = d.duration_column;
      if (d.duration_unit === "minutes" || d.duration_unit === "seconds") duration.duration_unit = d.duration_unit;
      if (typeof d.start_column === "string") duration.start_column = d.start_column;
      if (typeof d.end_column === "string") duration.end_column = d.end_column;
    }
  }

  return {
    config: {
      version: "1",
      mapping,
      duration,
      range_rules,
      allowed_values_rules,
      excluded_columns,
      enabled_checks,
    },
    warning: warnings.length > 0 ? warnings.join(" ") : null,
  };
}

export function App() {
  const [step, setStep] = useState<Step>("import");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [profileResult, setProfileResult] = useState<ProfileOutput | null>(null);
  const [mapping, setMapping] = useState<MappingConfig>({});
  const [durationMapping, setDurationMapping] = useState<DurationMapping>(DEFAULT_DURATION);
  const [summaryResult, setSummaryResult] = useState<SummaryOutput | null>(null);
  const [checkResult, setCheckResult] = useState<CheckOutput | null>(null);
  const [performanceResult, setPerformanceResult] = useState<PerformanceOutput | null>(null);
  const [rangeRules, setRangeRules] = useState<RangeRule[]>([]);
  const [allowedValuesRules, setAllowedValuesRules] = useState<AllowedValuesRule[]>([]);
  const [excludedColumns, setExcludedColumns] = useState<string[]>([]);
  const [enabledChecks, setEnabledChecks] = useState<string[] | null>(null);
  const [runPhases, setRunPhases] = useState<Phase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runContext, setRunContext] = useState<RunContext>({
    lastCheckOutDir: null,
    lastConfigSnapshot: null,
  });
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const handleProfileFile = useCallback(async (selected: string) => {
    setError(null);
    setNotice(null);
    setFilePath(selected);
    setProfileResult(null);
    setSummaryResult(null);
    setCheckResult(null);
    setPerformanceResult(null);

    const tempOut = selected + ".d2e-profile.json";
    const result = await window.d2e.runEngine({
      command: "profile",
      input: selected,
      out: tempOut,
    });

    if (!result.ok) {
      setError(result.stderr || "Profile failed.");
      return;
    }

    const profile = result.data as ProfileOutput;
    setProfileResult(profile);

    const columnNames = profile.schema_profile.columns.map((c) => c.name);
    const autoMapping = autoGuessMapping(columnNames);
    const autoDuration = autoGuessDuration(columnNames);

    if (runContext.lastConfigSnapshot) {
      try {
        const loaded = sanitizeLoadedConfig(runContext.lastConfigSnapshot, profile);
        setMapping({ ...autoMapping, ...loaded.config.mapping });
        setDurationMapping(loaded.config.duration ?? autoDuration);
        setRangeRules(loaded.config.range_rules);
        setAllowedValuesRules(loaded.config.allowed_values_rules ?? []);
        setExcludedColumns(loaded.config.excluded_columns ?? []);
        setEnabledChecks(loaded.config.enabled_checks ?? null);
        if (loaded.warning) setNotice(loaded.warning);
      } catch {
        setMapping(autoMapping);
        setDurationMapping(autoDuration);
        setRangeRules([]);
        setAllowedValuesRules([]);
        setExcludedColumns([]);
        setEnabledChecks(null);
      }
    } else {
      setMapping(autoMapping);
      setDurationMapping(autoDuration);
      setRangeRules([]);
      setAllowedValuesRules([]);
      setExcludedColumns([]);
      setEnabledChecks(null);
    }

    setStep("mapping");
  }, [runContext.lastConfigSnapshot]);

  const handleSelectFile = useCallback(async () => {
    setError(null);
    setNotice(null);
    try {
      const selected = await window.d2e.selectFile();
      if (!selected) return;
      await handleProfileFile(selected);
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setError(`Failed to select file: ${msg}`);
    }
  }, [handleProfileFile]);

  const handleLoadSample = useCallback(async () => {
    try {
      const samplePath = await window.d2e.getSamplePath();
      if (!samplePath) {
        setError("Sample file not found.");
        return;
      }
      await handleProfileFile(samplePath);
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setError(`Failed to load sample: ${msg}`);
    }
  }, [handleProfileFile]);

  const handleConfirmMapping = useCallback(() => {
    setStep("rules");
  }, []);

  const handleLoadConfig = useCallback(async () => {
    try {
      setError(null);
      setNotice(null);
      const raw = await window.d2e.loadConfig();
      if (!raw) return;
      const loaded = sanitizeLoadedConfig(raw, profileResult);
      setMapping(loaded.config.mapping);
      setDurationMapping(loaded.config.duration ?? DEFAULT_DURATION);
      setRangeRules(loaded.config.range_rules);
      setAllowedValuesRules(loaded.config.allowed_values_rules ?? []);
      setExcludedColumns(loaded.config.excluded_columns ?? []);
      setEnabledChecks(loaded.config.enabled_checks ?? null);
      setRunContext((current) => ({ ...current, lastConfigSnapshot: loaded.config }));
      setNotice(loaded.warning ?? "Configuration loaded.");
    } catch (err) {
      setError(`Failed to load configuration: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [profileResult]);

  const handleSaveConfig = useCallback(async () => {
    try {
      setError(null);
      setNotice(null);
      const config: ProjectConfig = {
        version: "1",
        mapping,
        duration: durationMapping,
        range_rules: rangeRules,
        allowed_values_rules: allowedValuesRules,
        excluded_columns: excludedColumns,
        enabled_checks: enabledChecks ?? undefined,
      };
      const savePath = await window.d2e.saveConfig(config);
      if (!savePath) return;
      setRunContext((current) => ({ ...current, lastConfigSnapshot: config }));
      setNotice(`Configuration saved to ${savePath}`);
    } catch (err) {
      setError(`Failed to save configuration: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [mapping, durationMapping, rangeRules, allowedValuesRules, excludedColumns, enabledChecks]);

  const handleRunAnalysis = useCallback(async () => {
    if (!filePath) return;
    setStep("running");
    setError(null);
    setNotice(null);

    const initialPhases: Phase[] = [
      { label: "Summary analysis", status: "running" },
      { label: `HFC checks (${enabledChecks ? enabledChecks.length : 8} checks)`, status: "pending" },
      { label: "Performance metrics", status: "pending" },
    ];
    setRunPhases(initialPhases);

    try {
      const cleanMapping = Object.fromEntries(
        Object.entries(mapping).filter(([, value]) => value !== undefined && value !== "")
      );
      const mappingPath = await window.d2e.writeTempMapping(cleanMapping);

      const projectConfig: ProjectConfig = {
        version: "1",
        mapping,
        duration: durationMapping,
        range_rules: rangeRules,
        allowed_values_rules: allowedValuesRules,
        excluded_columns: excludedColumns,
        enabled_checks: enabledChecks ?? undefined,
      };

      const engineConfig: Record<string, unknown> = {};
      if (rangeRules.length > 0) engineConfig.range_rules = rangeRules;
      if (allowedValuesRules.length > 0) engineConfig.allowed_values_rules = allowedValuesRules;
      if (excludedColumns.length > 0) engineConfig.excluded_columns = excludedColumns;

      // Translate duration mapping to flat engine config keys
      if (durationMapping.mode === "column" && durationMapping.duration_column) {
        engineConfig.duration_mode = "column";
        engineConfig.duration_column = durationMapping.duration_column;
        engineConfig.duration_unit = durationMapping.duration_unit ?? "minutes";
      } else if (durationMapping.mode === "start_end" && durationMapping.start_column && durationMapping.end_column) {
        engineConfig.duration_mode = "start_end";
        engineConfig.duration_start_column = durationMapping.start_column;
        engineConfig.duration_end_column = durationMapping.end_column;
      } else {
        engineConfig.duration_mode = "none";
        engineConfig.duration_column = "";
      }

      let configPath: string | undefined;
      if (Object.keys(engineConfig).length > 0) {
        configPath = await window.d2e.writeTempConfig(engineConfig);
      }

      const tempOut = filePath + ".d2e-summary.json";
      const sumResult = await window.d2e.runEngine({
        command: "summarize",
        input: filePath,
        mapping: mappingPath,
        config: configPath,
        out: tempOut,
      });

      if (!sumResult.ok) {
        setRunPhases((prev) => prev.map((p, i) => i === 0 ? { ...p, status: "error" } : p));
        setError(sumResult.stderr || "Summary failed.");
        setStep("rules");
        return;
      }
      setSummaryResult(sumResult.data as SummaryOutput);
      setRunPhases((prev) => prev.map((p, i) =>
        i === 0 ? { ...p, status: "done" } : i === 1 ? { ...p, status: "running" } : p
      ));

      const outDir = filePath + ".d2e-checks";
      const priorFlags = runContext.lastCheckOutDir ? `${runContext.lastCheckOutDir}/flags.csv` : undefined;
      const chkResult = await window.d2e.runEngine({
        command: "check",
        input: filePath,
        mapping: mappingPath,
        config: configPath,
        outDir,
        priorFlags,
        appVersion: APP_VERSION,
        checks: enabledChecks ? enabledChecks.join(",") : undefined,
      });

      let checkSummaryPath: string | undefined;
      if (chkResult.ok && chkResult.data) {
        const data = chkResult.data as {
          flags: CheckOutput["flags"];
          summary: CheckOutput["summary"];
          run_metadata: RunMetadata;
        };
        setCheckResult({
          ok: true,
          flags: data.flags,
          summary: data.summary,
          run_metadata: data.run_metadata,
        });
        setRunContext({
          lastCheckOutDir: outDir,
          lastConfigSnapshot: projectConfig,
        });
        checkSummaryPath = outDir + "/summary.json";
      } else {
        setCheckResult(null);
        setRunContext((current) => ({ ...current, lastConfigSnapshot: projectConfig }));
      }

      setRunPhases((prev) => prev.map((p, i) =>
        i === 1 ? { ...p, status: "done" } : i === 2 ? { ...p, status: "running" } : p
      ));

      // Phase 3: Performance metrics (non-fatal)
      try {
        const perfOut = filePath + ".d2e-performance.json";
        const perfResult = await window.d2e.runEngine({
          command: "performance",
          input: filePath,
          mapping: mappingPath,
          config: configPath,
          out: perfOut,
          checkSummary: checkSummaryPath,
        });
        if (perfResult.ok && perfResult.data) {
          setPerformanceResult(perfResult.data as PerformanceOutput);
        } else {
          setPerformanceResult(null);
        }
      } catch {
        setPerformanceResult(null);
      }

      setRunPhases((prev) => prev.map((p, i) => i === 2 ? { ...p, status: "done" } : p));
      setStep("results");
    } catch (err) {
      setError(String(err));
      setStep("rules");
    }
  }, [filePath, mapping, durationMapping, rangeRules, allowedValuesRules, excludedColumns, enabledChecks, runContext.lastCheckOutDir]);

  const handleExportReport = useCallback(async () => {
    if (!profileResult || !summaryResult || !filePath) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const reportData = {
        profile: profileResult.schema_profile,
        summary_stats: summaryResult.summary_stats,
        check_summary: checkResult?.summary ?? {
          run_id: "",
          total_flags: 0,
          by_severity: {},
          by_check: {},
          by_enumerator: {},
          has_prior_run: false,
          new_flags_count: 0,
          resolved_flags_count: 0,
          persisting_flags_count: 0,
          skipped_checks: [],
        },
        flags: checkResult?.flags ?? [],
        run_metadata: checkResult?.run_metadata ?? {
          run_id: "",
          dataset_path: filePath,
          dataset_hash: "",
          config_hash: "",
          engine_version: APP_VERSION,
          app_version: APP_VERSION,
          checks_requested: "all",
          timestamp: new Date().toISOString(),
        },
        mapping,
      };

      const tempPath = await window.d2e.writeTempConfig(reportData as Record<string, unknown>);
      const dataName = filePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") ?? "d2e";
      const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const savePath = await window.d2e.saveFile(`${datePrefix}_${dataName}_HFCReport.xlsx`, "xlsx");
      if (!savePath) {
        setExporting(false);
        return;
      }

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

  const handleExportFlags = useCallback(async (content: string) => {
    if (!filePath) return;
    setExportMessage(null);
    try {
      const dataName = filePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") ?? "d2e";
      const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const savePath = await window.d2e.saveFile(`${datePrefix}_${dataName}_HFCReport.csv`, "csv");
      if (!savePath) return;
      await window.d2e.writeFile(savePath, content);
      setExportMessage(`Flags exported to ${savePath}`);
    } catch (err) {
      setExportMessage(`Flag export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [filePath]);

  const handleStartOver = useCallback(() => {
    setStep("import");
    setFilePath(null);
    setProfileResult(null);
    setMapping({});
    setDurationMapping(DEFAULT_DURATION);
    setRangeRules([]);
    setAllowedValuesRules([]);
    setExcludedColumns([]);
    setEnabledChecks(null);
    setSummaryResult(null);
    setCheckResult(null);
    setPerformanceResult(null);
    setError(null);
    setNotice(null);
    setExportMessage(null);
  }, []);

  // Classify errors for ErrorBanner
  const errorInfo = error ? classifyError(error) : null;

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
          onLoadSample={handleLoadSample}
        />
      )}

      {step === "mapping" && profileResult && (
        <MappingStep
          profileResult={profileResult}
          mapping={mapping}
          onMappingChange={setMapping}
          durationMapping={durationMapping}
          onDurationMappingChange={setDurationMapping}
          onConfirm={handleConfirmMapping}
          onBack={() => setStep("import")}
          onLoadConfig={handleLoadConfig}
        />
      )}

      {step === "rules" && profileResult && (
        <RulesStep
          profileResult={profileResult}
          rangeRules={rangeRules}
          onRulesChange={setRangeRules}
          allowedValuesRules={allowedValuesRules}
          onAllowedValuesChange={setAllowedValuesRules}
          excludedColumns={excludedColumns}
          onExcludedColumnsChange={setExcludedColumns}
          enabledChecks={enabledChecks}
          onEnabledChecksChange={setEnabledChecks}
          mappedFields={Object.keys(mapping).filter(
            (k) => mapping[k as keyof MappingConfig] !== undefined && mapping[k as keyof MappingConfig] !== ""
          )}
          onConfirm={handleRunAnalysis}
          onBack={() => setStep("mapping")}
          onSaveConfig={handleSaveConfig}
        />
      )}

      {step === "running" && (
        <RunningStep
          phases={runPhases}
          rowCount={profileResult?.schema_profile.row_count}
        />
      )}

      {step === "results" && profileResult && summaryResult && (
        <>
          <ResultsStep
            profileResult={profileResult}
            summaryResult={summaryResult}
            checkResult={checkResult}
            performanceResult={performanceResult}
            onStartOver={handleStartOver}
            onExportReport={handleExportReport}
            onExportFlags={handleExportFlags}
            exporting={exporting}
          />
          {exportMessage && (
            <div className={`mt-4 p-3 rounded-lg text-sm ${
              exportMessage.startsWith("Report saved") || exportMessage.startsWith("Flags exported")
                ? "bg-green-50 border border-green-200 text-green-800"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {exportMessage}
            </div>
          )}
        </>
      )}

      {step !== "import" && notice && (
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          {notice}
        </div>
      )}

      {step !== "import" && errorInfo && (
        <div className="mt-6">
          <ErrorBanner
            type={errorInfo.type}
            message={errorInfo.message}
            suggestion={errorInfo.suggestion}
            onAction={step === "running" ? () => setStep("rules") : undefined}
            actionLabel={step === "running" ? "Back to Rules" : undefined}
          />
        </div>
      )}
    </main>
  );
}
