import { useCallback, useEffect, useState } from "react";
import type {
  AllowedValuesRule,
  CheckOutput,
  DecisionsFile,
  DurationMapping,
  FlagDecision,
  FlagRow,
  MappingConfig,
  PerformanceOutput,
  ProfileOutput,
  ProjectConfig,
  RangeRule,
  RecentProject,
  RunMetadata,
  SkipRule,
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
import { StepPanel } from "./components/StepPanel";
import { parseReviewedCsv } from "./utils/csvDecisionParser";

type Step = "import" | "mapping" | "rules" | "running" | "results";

type RunContext = {
  lastConfigSnapshot: ProjectConfig | null;
};

type LoadedProjectConfig = {
  config: ProjectConfig;
  warning: string | null;
};

function flagKeyStr(flag: FlagRow): string {
  return `${flag.id}|${flag.check_id}|${flag.column_name}|${flag.enumerator_id}|${flag.survey_date}`;
}

const APP_VERSION = "0.1.0";

const MAPPING_FIELDS: (keyof MappingConfig)[] = [
  "id",
  "enumerator_id",
  "survey_date",
];

const MAPPING_ALIASES: Record<keyof MappingConfig, string[]> = {
  id: ["id", "resp_id", "respondent_id", "response_id", "record_id", "uid", "unique_id", "key", "_id", "submission_id"],
  enumerator_id: ["enumerator_id", "interviewer_id", "enum_id", "enumerator", "interviewer", "collector_id", "agent_id"],
  survey_date: ["survey_date", "date", "interview_date", "submission_date", "created_date", "start_date", "datetime", "timestamp"],
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
    skip_rules?: unknown;
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

  // Skip rules
  const skipInput = Array.isArray(candidate.skip_rules) ? candidate.skip_rules : [];
  const skip_rules: SkipRule[] = [];
  for (const rule of skipInput) {
    if (!rule || typeof rule !== "object") continue;
    const record = rule as Record<string, unknown>;
    const dependent = typeof record.dependent_column === "string" ? record.dependent_column : "";
    if (!dependent) continue;
    if (columns.size > 0 && !columns.has(dependent)) {
      warnings.push(`Dropped skip rule targeting "${dependent}" because the column is missing in this dataset.`);
      continue;
    }
    const rawGroups = Array.isArray(record.condition_groups) ? record.condition_groups : [];
    const condition_groups: Array<{ conditions: Array<{ column: string; values: string[] }>; logic: "AND" | "OR" }> = [];
    for (const group of rawGroups) {
      if (!group || typeof group !== "object") continue;
      const g = group as Record<string, unknown>;
      const rawConditions = Array.isArray(g.conditions) ? g.conditions : [];
      const conditions: Array<{ column: string; values: string[] }> = [];
      for (const cond of rawConditions) {
        if (!cond || typeof cond !== "object") continue;
        const c = cond as Record<string, unknown>;
        const col = typeof c.column === "string" ? c.column : "";
        if (!col) continue;
        if (columns.size > 0 && !columns.has(col)) continue;
        const vals = Array.isArray(c.values) ? c.values.map(String) : [];
        conditions.push({ column: col, values: vals });
      }
      if (conditions.length > 0) {
        const logic = g.logic === "OR" ? "OR" as const : "AND" as const;
        condition_groups.push({ conditions, logic });
      }
    }
    if (condition_groups.length > 0) {
      const group_logic = record.group_logic === "OR" ? "OR" as const : "AND" as const;
      skip_rules.push({ condition_groups, group_logic, dependent_column: dependent });
    }
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
      skip_rules,
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
  const [skipRules, setSkipRules] = useState<SkipRule[]>([]);
  const [excludedColumns, setExcludedColumns] = useState<string[]>([]);
  const [enabledChecks, setEnabledChecks] = useState<string[] | null>(null);
  const [runPhases, setRunPhases] = useState<Phase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runContext, setRunContext] = useState<RunContext>({
    lastConfigSnapshot: null,
  });
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, FlagDecision>>({});
  const [suppressedFlags, setSuppressedFlags] = useState<FlagRow[]>([]);
  const [undoToast, setUndoToast] = useState<{
    message: string;
    undoSnapshot: {
      decisions: Record<string, FlagDecision>;
      checkResult: CheckOutput;
      suppressedFlags: FlagRow[];
    };
    timerId: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  // Load recent projects on mount
  useEffect(() => {
    window.d2e.getRecentProjects().then(setRecentProjects).catch((err) => {
      console.warn("Failed to load recent projects:", err);
    });
  }, []);

  const handleProfileFile = useCallback(async (selected: string) => {
    setError(null);
    setNotice(null);
    setFilePath(selected);
    setProfileResult(null);
    setSummaryResult(null);
    setCheckResult(null);
    setPerformanceResult(null);
    // Reset is no longer needed — delta is persistent via output dir

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

    // Priority: in-session snapshot > sidecar config > auto-guess only
    let configSource: unknown = runContext.lastConfigSnapshot;
    if (!configSource) {
      try {
        configSource = await window.d2e.autoLoadConfig(selected);
      } catch {
        // sidecar missing or corrupt — fall through
      }
    }

    if (configSource) {
      try {
        const loaded = sanitizeLoadedConfig(configSource, profile);
        setMapping({ ...autoMapping, ...loaded.config.mapping });
        setDurationMapping(loaded.config.duration ?? autoDuration);
        setRangeRules(loaded.config.range_rules);
        setAllowedValuesRules(loaded.config.allowed_values_rules ?? []);
        setSkipRules(loaded.config.skip_rules ?? []);
        setExcludedColumns(loaded.config.excluded_columns ?? []);
        setEnabledChecks(loaded.config.enabled_checks ?? null);
        if (loaded.warning) setNotice(loaded.warning);
        else if (!runContext.lastConfigSnapshot) setNotice("Loaded saved configuration.");
      } catch {
        setMapping(autoMapping);
        setDurationMapping(autoDuration);
        setRangeRules([]);
        setAllowedValuesRules([]);
        setSkipRules([]);
        setExcludedColumns([]);
        setEnabledChecks(null);
      }
    } else {
      setMapping(autoMapping);
      setDurationMapping(autoDuration);
      setRangeRules([]);
      setAllowedValuesRules([]);
      setSkipRules([]);
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

  const handleOpenRecent = useCallback(async (recentFilePath: string) => {
    try {
      await handleProfileFile(recentFilePath);
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setError(`Failed to open recent project: ${msg}`);
    }
  }, [handleProfileFile]);

  const handleRemoveRecent = useCallback(async (recentFilePath: string) => {
    try {
      await window.d2e.removeRecentProject(recentFilePath);
      setRecentProjects((prev) => prev.filter((p) => p.filePath !== recentFilePath));
    } catch {
      // silent — non-critical
    }
  }, []);

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
      setSkipRules(loaded.config.skip_rules ?? []);
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
        skip_rules: skipRules,
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
  }, [mapping, durationMapping, rangeRules, allowedValuesRules, skipRules, excludedColumns, enabledChecks]);

  const handleRunAnalysis = useCallback(async () => {
    if (!filePath) return;
    setStep("running");
    setError(null);
    setNotice(null);

    const initialPhases: Phase[] = [
      { label: "Summary analysis", status: "running" },
      { label: `HFC checks (${enabledChecks ? enabledChecks.length : 9} checks)`, status: "pending" },
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
        skip_rules: skipRules,
        excluded_columns: excludedColumns,
        enabled_checks: enabledChecks ?? undefined,
      };

      const engineConfig: Record<string, unknown> = {};
      if (rangeRules.length > 0) engineConfig.range_rules = rangeRules;
      if (allowedValuesRules.length > 0) engineConfig.allowed_values_rules = allowedValuesRules;
      if (skipRules.length > 0) engineConfig.skip_rules = skipRules;
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
      // Always pass prior flags from the deterministic output dir — engine validates dataset_hash
      const priorFlags = `${outDir}/flags.csv`;
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
        setSuppressedFlags([]); // Suppressed flags are handled by engine; reset UI list
        setRunContext({ lastConfigSnapshot: projectConfig });
        checkSummaryPath = outDir + "/summary.json";

        // Load decisions from disk for in-app dismiss UI
        try {
          const raw = await window.d2e.loadDecisions(outDir);
          if (raw && typeof raw === "object" && "decisions" in (raw as Record<string, unknown>)) {
            setDecisions((raw as DecisionsFile).decisions);
          } else {
            setDecisions({});
          }
        } catch {
          setDecisions({});
        }
      } else {
        setCheckResult(null);
        setRunContext({ lastConfigSnapshot: projectConfig });
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

      // Auto-save config sidecar + upsert recent project registry
      const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
      const recentEntry: RecentProject = {
        filePath,
        fileName,
        lastRunAt: new Date().toISOString(),
        rowCount: profileResult?.schema_profile.row_count ?? 0,
        colCount: profileResult?.schema_profile.column_count ?? 0,
      };
      window.d2e.autoSaveConfig(filePath, projectConfig, recentEntry)
        .then(() => window.d2e.getRecentProjects())
        .then(setRecentProjects)
        .catch((err) => {
          console.error("Auto-save config / recent projects failed:", err);
        });

      setStep("results");
    } catch (err) {
      setError(String(err));
      setStep("rules");
    }
  }, [filePath, profileResult, mapping, durationMapping, rangeRules, allowedValuesRules, skipRules, excludedColumns, enabledChecks]);

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
        suppressed_flags: suppressedFlags,
        decisions,
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
  }, [filePath, profileResult, summaryResult, checkResult, mapping, suppressedFlags, decisions]);

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

  const handleExportDofile = useCallback(async () => {
    if (!filePath) return;
    setExportMessage(null);
    try {
      const outDir = filePath + ".d2e-checks";
      const content = await window.d2e.readDofile(outDir);
      if (!content) {
        setExportMessage("No Stata .do file found — run checks first.");
        return;
      }
      const dataName = filePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") ?? "d2e";
      const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const savePath = await window.d2e.saveFile(`${datePrefix}_${dataName}_checks.do`, "do");
      if (!savePath) return;
      await window.d2e.writeFile(savePath, content);
      setExportMessage(`Stata .do file saved to ${savePath}`);
    } catch (err) {
      setExportMessage(`Stata .do export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [filePath]);

  const saveDecisionsToDisk = useCallback(async (updated: Record<string, FlagDecision>) => {
    if (!filePath) return;
    const outDir = filePath + ".d2e-checks";
    const payload: DecisionsFile = {
      schema_version: 1,
      dataset_hash: checkResult?.run_metadata?.dataset_hash ?? "",
      updated_at: new Date().toISOString(),
      decisions: updated,
    };
    try {
      await window.d2e.saveDecisions(outDir, payload);
    } catch (err) {
      console.error("Failed to save decisions:", err);
    }
  }, [filePath, checkResult]);

  const handleResolveFlags = useCallback((flagsToResolve: FlagRow[], note: string = "") => {
    if (!checkResult) return;

    // Snapshot current state for undo
    const prevDecisions = { ...decisions };
    const prevCheckResult = checkResult;
    const prevSuppressed = [...suppressedFlags];

    // Build new decisions
    const now = new Date().toISOString();
    const newDecisions = { ...decisions };
    for (const flag of flagsToResolve) {
      const key = flagKeyStr(flag);
      newDecisions[key] = {
        status: "dismissed",
        reason: "accepted",
        note,
        observed_value_at_decision: flag.observed_value,
        decided_at: now,
        decided_by: "app",
      };
    }
    setDecisions(newDecisions);

    // Move resolved flags from active to suppressed (client-side)
    const resolvedKeys = new Set(flagsToResolve.map(flagKeyStr));
    const remainingFlags = checkResult.flags.filter(f => !resolvedKeys.has(flagKeyStr(f)));
    const newSuppressed = checkResult.flags.filter(f => resolvedKeys.has(flagKeyStr(f)));
    setSuppressedFlags(prev => [...prev, ...newSuppressed]);
    const updatedCheckResult: CheckOutput = {
      ...checkResult,
      flags: remainingFlags,
      summary: {
        ...checkResult.summary,
        total_flags: remainingFlags.length,
        suppressed_count: (checkResult.summary.suppressed_count ?? 0) + newSuppressed.length,
        total_before_suppression: checkResult.summary.total_before_suppression ?? checkResult.summary.total_flags,
      },
    };
    setCheckResult(updatedCheckResult);

    // Cancel any prior undo toast timer and commit its changes
    if (undoToast) {
      clearTimeout(undoToast.timerId);
    }

    // Show undo toast — delay disk write by 5s
    const count = flagsToResolve.length;
    const label = count === 1
      ? `Resolved 1 flag (${flagsToResolve[0].id || flagsToResolve[0].check_id})`
      : `Resolved ${count} flags`;
    const timerId = setTimeout(() => {
      saveDecisionsToDisk(newDecisions);
      setUndoToast(null);
    }, 5000);

    setUndoToast({
      message: label,
      undoSnapshot: {
        decisions: prevDecisions,
        checkResult: prevCheckResult,
        suppressedFlags: prevSuppressed,
      },
      timerId,
    });
  }, [checkResult, decisions, suppressedFlags, saveDecisionsToDisk, undoToast]);

  const handleUndoResolve = useCallback(() => {
    if (!undoToast) return;
    clearTimeout(undoToast.timerId);
    setDecisions(undoToast.undoSnapshot.decisions);
    setCheckResult(undoToast.undoSnapshot.checkResult);
    setSuppressedFlags(undoToast.undoSnapshot.suppressedFlags);
    // Save the restored decisions to disk (overwrite with pre-resolve state)
    saveDecisionsToDisk(undoToast.undoSnapshot.decisions);
    setUndoToast(null);
  }, [undoToast, saveDecisionsToDisk]);

  const handleUnresolveFlags = useCallback((flagsToUnresolve: FlagRow[]) => {
    if (!checkResult) return;
    const keysToRemove = new Set(flagsToUnresolve.map(flagKeyStr));

    // Remove from decisions
    const newDecisions = { ...decisions };
    for (const key of keysToRemove) {
      delete newDecisions[key];
    }
    setDecisions(newDecisions);

    // Move flags back from suppressed to active
    const restored = suppressedFlags.filter(f => keysToRemove.has(flagKeyStr(f)));
    const remainingSuppressed = suppressedFlags.filter(f => !keysToRemove.has(flagKeyStr(f)));
    setSuppressedFlags(remainingSuppressed);
    setCheckResult({
      ...checkResult,
      flags: [...checkResult.flags, ...restored],
      summary: {
        ...checkResult.summary,
        total_flags: checkResult.flags.length + restored.length,
        suppressed_count: Math.max(0, (checkResult.summary.suppressed_count ?? 0) - restored.length),
      },
    });

    // Persist immediately (no undo window for unresolve — it's already the safety net)
    saveDecisionsToDisk(newDecisions);
  }, [checkResult, decisions, suppressedFlags, saveDecisionsToDisk]);

  const handleImportReviewedCsv = useCallback(async () => {
    try {
      const csvText = await window.d2e.importReviewedCSV();
      if (!csvText) return; // User cancelled

      const { decisions: imported, importedCount, skippedCount } = parseReviewedCsv(csvText);
      if (importedCount === 0) {
        setNotice(`No resolved flags found in CSV (${skippedCount} rows had no recognized status). Expected a "status" column with values like Resolved, Accepted, Dismissed, etc.`);
        return;
      }

      // Merge: imported decisions override existing ones
      const merged = { ...decisions, ...imported };
      setDecisions(merged);
      await saveDecisionsToDisk(merged);
      setNotice(`Imported ${importedCount} decision${importedCount === 1 ? "" : "s"} from CSV.${skippedCount > 0 ? ` ${skippedCount} rows skipped (status not resolved).` : ""} Re-run checks to apply.`);
    } catch (err) {
      setError(`CSV import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [decisions, saveDecisionsToDisk]);

  const handleStartOver = useCallback(() => {
    setStep("import");
    setFilePath(null);
    setProfileResult(null);
    setMapping({});
    setDurationMapping(DEFAULT_DURATION);
    setRangeRules([]);
    setAllowedValuesRules([]);
    setSkipRules([]);
    setExcludedColumns([]);
    setEnabledChecks(null);
    setSummaryResult(null);
    setCheckResult(null);
    setPerformanceResult(null);
    setError(null);
    setNotice(null);
    setExportMessage(null);
    setDecisions({});
    setSuppressedFlags([]);
    if (undoToast) {
      clearTimeout(undoToast.timerId);
      setUndoToast(null);
    }
  }, [undoToast]);

  // Classify errors for ErrorBanner
  const errorInfo = error ? classifyError(error) : null;

  return (
    <main className="app-card max-w-3xl mx-auto my-8 rounded-2xl font-sans">
      <div className="sticky top-0 z-20 app-card-header px-6 pt-6 pb-0 rounded-t-2xl">
        <div className="flex items-center justify-between mb-4">
          <img src="/header.png" alt="data2explore" className="h-10" />
          <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-indigo-400">
              <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" />
            </svg>
            Local only
          </span>
        </div>
        <Stepper currentStep={step} />
      </div>
      <div className="px-6 pb-8 pt-2">

      {step === "import" && (
        <StepPanel key="import">
        <ImportStep
          filePath={filePath}
          profileResult={profileResult}
          error={error}
          onSelectFile={handleSelectFile}
          onLoadSample={handleLoadSample}
          recentProjects={recentProjects}
          onOpenRecent={handleOpenRecent}
          onRemoveRecent={handleRemoveRecent}
        />
        </StepPanel>
      )}

      {step === "mapping" && profileResult && (
        <StepPanel key="mapping">
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
        </StepPanel>
      )}

      {step === "rules" && profileResult && (
        <StepPanel key="rules">
        <RulesStep
          profileResult={profileResult}
          rangeRules={rangeRules}
          onRulesChange={setRangeRules}
          allowedValuesRules={allowedValuesRules}
          onAllowedValuesChange={setAllowedValuesRules}
          skipRules={skipRules}
          onSkipRulesChange={setSkipRules}
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
        </StepPanel>
      )}

      {step === "running" && (
        <StepPanel key="running">
        <RunningStep
          phases={runPhases}
          rowCount={profileResult?.schema_profile.row_count}
        />
        </StepPanel>
      )}

      {step === "results" && profileResult && summaryResult && (
        <StepPanel key="results">
          <ResultsStep
            profileResult={profileResult}
            summaryResult={summaryResult}
            checkResult={checkResult}
            performanceResult={performanceResult}
            onStartOver={handleStartOver}
            onExportFlags={handleExportFlags}
            onResolveFlags={handleResolveFlags}
            onUnresolveFlags={handleUnresolveFlags}
            onImportReviewedCsv={handleImportReviewedCsv}
            onExportDofile={handleExportDofile}
            suppressedFlags={suppressedFlags}
            decisions={decisions}
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
        </StepPanel>
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
      </div>

      {undoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-slate-800 text-white rounded-lg text-sm flex items-center gap-4 shadow-lg max-w-md">
          <span>{undoToast.message}</span>
          <button
            onClick={handleUndoResolve}
            className="px-3 py-1 text-sm font-semibold rounded bg-white text-slate-800 hover:bg-slate-100 transition-colors flex-shrink-0"
          >
            Undo
          </button>
        </div>
      )}
    </main>
  );
}
