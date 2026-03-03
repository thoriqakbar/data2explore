import { useState } from "react";
import type { AllowedValuesRule, ProfileOutput, RangeRule, SkipRule, SkipConditionGroup } from "../../../shared/index";

interface Props {
  profileResult: ProfileOutput;
  rangeRules: RangeRule[];
  onRulesChange: (rules: RangeRule[]) => void;
  allowedValuesRules: AllowedValuesRule[];
  onAllowedValuesChange: (rules: AllowedValuesRule[]) => void;
  skipRules: SkipRule[];
  onSkipRulesChange: (rules: SkipRule[]) => void;
  excludedColumns: string[];
  onExcludedColumnsChange: (cols: string[]) => void;
  enabledChecks: string[] | null;
  onEnabledChecksChange: (checks: string[] | null) => void;
  mappedFields: string[];
  onConfirm: () => void;
  onBack: () => void;
  onSaveConfig?: () => void;
}

const ALL_CHECKS: Array<{
  id: string;
  name: string;
  description: string;
  requiredFields: string[];
  glossary: {
    detects: string;
    severity: string;
    thresholds: string;
    remediation: string;
  };
}> = [
  {
    id: "CHK-001",
    name: "Duplicate ID",
    description: "Flag duplicate survey IDs",
    requiredFields: ["id"],
    glossary: {
      detects: "Rows where the same ID appears more than once — double submissions, merge errors, or copy-paste mistakes.",
      severity: "Critical",
      thresholds: "Any ID appearing >1 time. No configurable threshold.",
      remediation: "Check if duplicates are true double-submissions (delete one) or distinct records with misassigned IDs (correct the ID).",
    },
  },
  {
    id: "CHK-002",
    name: "Missingness by Variable",
    description: "Flag columns with high missing rates",
    requiredFields: [],
    glossary: {
      detects: "Columns with high missing/empty rates — may indicate broken skip patterns, confusing questions, or systematic non-response.",
      severity: "Warning >20%, Critical >50%",
      thresholds: "Warning: 20% missing rate. Critical: 50%. Both configurable.",
      remediation: "Investigate why the variable has blanks. Check skip patterns, enumerator behavior, or instrument design.",
    },
  },
  {
    id: "CHK-004",
    name: "Missingness by Enumerator",
    description: "Flag enumerators with unusual missing rates",
    requiredFields: ["enumerator_id"],
    glossary: {
      detects: "Enumerators whose per-column missing rate exceeds the dataset-wide average — may be skipping questions or misunderstanding the instrument.",
      severity: "Warning 2x average, Critical 4x",
      thresholds: "2x overall missing rate (Warning), 4x (Critical). Min 10 rows per enumerator. Columns with <1% overall rate skipped.",
      remediation: "Compare with peers. If concentrated in specific variables, provide targeted retraining. If pervasive, consider a back-check.",
    },
  },
  {
    id: "CHK-005",
    name: "Range Check",
    description: "Flag values outside min/max bounds",
    requiredFields: [],
    glossary: {
      detects: "Values outside user-defined min/max bounds — usually data entry errors (age=999) or unit confusion.",
      severity: "Critical",
      thresholds: "User-defined per column in Range Rules below.",
      remediation: "Verify with original record or enumerator. Common fixes: correcting typos, converting units, replacing with intended value.",
    },
  },
  {
    id: "CHK-008",
    name: "Outlier Z-score",
    description: "Flag statistical outliers in numeric columns",
    requiredFields: [],
    glossary: {
      detects: "Values statistically extreme relative to the column (high z-score) — may be entry errors, measurement issues, or genuinely unusual values.",
      severity: "Warning",
      thresholds: "|z| > 3.0 (configurable). Columns with near-zero variance auto-skipped.",
      remediation: "Review in context. Correct if typo/unit error. If plausible but extreme, document it. Some flags may be legitimate values.",
    },
  },
  {
    id: "CHK-010",
    name: "Duration Anomaly",
    description: "Flag unusually short/long surveys",
    requiredFields: ["survey_date"],
    glossary: {
      detects: "Suspicious interview durations relative to the dataset: impossible (\u22640 min), unusually short or long compared to the median, or heaped (round numbers suggesting fabrication).",
      severity: "Critical (impossible), Warning (others)",
      thresholds: "Short/long: beyond 3\u00d7 MAD from the median duration (configurable). Heaped: multiples of 5 min \u226415 min. Impossible: \u22640 min.",
      remediation: "Impossible \u2192 check device timestamps. Short \u2192 check for rushing/fabrication. Long \u2192 idle device. Heaped \u2192 enumerator estimated time.",
    },
  },
  {
    id: "CHK-012",
    name: "Allowed Values",
    description: "Flag values not in allowed set",
    requiredFields: [],
    glossary: {
      detects: "Values not in a user-defined allowed set — catches invalid codes, misspellings, unexpected categories.",
      severity: "Critical",
      thresholds: "User-defined per column in Allowed Values below. Any non-missing value not in list is flagged.",
      remediation: "Check for typos, encoding errors (spaces, case). If legitimate, add to allowed set. For systematic issues, update instrument constraints.",
    },
  },
  {
    id: "CHK-006",
    name: "Skip Logic",
    description: "Flag values that should be missing per skip rules",
    requiredFields: ["id"],
    glossary: {
      detects: "Rows where a dependent column has a value despite skip conditions being met — indicates data entry errors or questionnaire programming issues.",
      severity: "Critical",
      thresholds: "User-defined skip rules below. If conditions fire and dependent column is not empty, the row is flagged.",
      remediation: "Verify with original record. Check if skip logic was correctly programmed in the instrument. Correct the value or clear it if genuinely skipped.",
    },
  },
  {
    id: "CHK-009",
    name: "Enumerator Anomaly Rate",
    description: "Flag enumerators with high flag rates",
    requiredFields: ["enumerator_id"],
    glossary: {
      detects: "Meta-check: enumerators with disproportionately many flags across all checks, suggesting need for supervision or retraining.",
      severity: "Warning 2x median, Critical 4x",
      thresholds: "2x median flag count (Warning), 4x (Critical). Min 5 flags to trigger. Runs last.",
      remediation: "Review individual flags for patterns. Multiple check types \u2192 accompaniment visit. Single check type \u2192 targeted retraining.",
    },
  },
];

function getNumericColumns(profile: ProfileOutput): string[] {
  return profile.schema_profile.columns
    .filter((c) => /int|float/.test(c.dtype))
    .map((c) => c.name);
}

function getAllColumns(profile: ProfileOutput): string[] {
  return profile.schema_profile.columns.map((c) => c.name);
}

export function RulesStep({
  profileResult,
  rangeRules,
  onRulesChange,
  allowedValuesRules,
  onAllowedValuesChange,
  skipRules,
  onSkipRulesChange,
  excludedColumns,
  onExcludedColumnsChange,
  enabledChecks,
  onEnabledChecksChange,
  mappedFields,
  onConfirm,
  onBack,
  onSaveConfig,
}: Props) {
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const numericColumns = getNumericColumns(profileResult);
  const allColumns = getAllColumns(profileResult);
  const usedColumns = new Set(rangeRules.map((r) => r.column));
  const availableColumns = numericColumns.filter((c) => !usedColumns.has(c));

  const handleAddRule = (column: string) => {
    onRulesChange([...rangeRules, { column, min: null, max: null }]);
  };

  const handleRemoveRule = (index: number) => {
    onRulesChange(rangeRules.filter((_, i) => i !== index));
  };

  const handleUpdateRule = (
    index: number,
    field: "min" | "max",
    raw: string
  ) => {
    const updated = rangeRules.map((rule, i) => {
      if (i !== index) return rule;
      const value = raw.trim() === "" ? null : Number(raw);
      return { ...rule, [field]: Number.isNaN(value) ? null : value };
    });
    onRulesChange(updated);
  };

  // ── Allowed Values handlers ──
  const usedAVColumns = new Set(allowedValuesRules.map((r) => r.column));
  const availableAVColumns = allColumns.filter((c) => !usedAVColumns.has(c));

  const handleAddAVRule = (column: string) => {
    onAllowedValuesChange([...allowedValuesRules, { column, values: [] }]);
  };

  const handleRemoveAVRule = (index: number) => {
    onAllowedValuesChange(allowedValuesRules.filter((_, i) => i !== index));
  };

  const handleUpdateAVValues = (index: number, raw: string) => {
    const updated = allowedValuesRules.map((rule, i) => {
      if (i !== index) return rule;
      const values = raw
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v !== "");
      return { ...rule, values };
    });
    onAllowedValuesChange(updated);
  };

  // ── Skip Logic Rule handlers ──
  const handleAddSkipRule = () => {
    onSkipRulesChange([
      ...skipRules,
      {
        condition_groups: [{ conditions: [{ column: "", values: [] }], logic: "AND" as const }],
        group_logic: "AND",
        dependent_column: "",
      },
    ]);
  };

  const handleRemoveSkipRule = (index: number) => {
    onSkipRulesChange(skipRules.filter((_, i) => i !== index));
  };

  const handleUpdateSkipGroupLogic = (index: number, logic: "AND" | "OR") => {
    onSkipRulesChange(
      skipRules.map((rule, i) => (i === index ? { ...rule, group_logic: logic } : rule))
    );
  };

  const handleUpdateSkipRuleDependent = (index: number, col: string) => {
    onSkipRulesChange(
      skipRules.map((rule, i) => (i === index ? { ...rule, dependent_column: col } : rule))
    );
  };

  const updateGroups = (ruleIndex: number, updater: (groups: SkipConditionGroup[]) => SkipConditionGroup[]) => {
    onSkipRulesChange(
      skipRules.map((rule, i) =>
        i === ruleIndex ? { ...rule, condition_groups: updater(rule.condition_groups) } : rule
      )
    );
  };

  const handleAddSkipGroup = (ruleIndex: number) => {
    updateGroups(ruleIndex, (groups) => [
      ...groups,
      { conditions: [{ column: "", values: [] }], logic: "AND" as const },
    ]);
  };

  const handleUpdateGroupLogic = (ruleIndex: number, groupIndex: number, logic: "AND" | "OR") => {
    updateGroups(ruleIndex, (groups) =>
      groups.map((g, gi) => (gi === groupIndex ? { ...g, logic } : g))
    );
  };

  const handleRemoveSkipGroup = (ruleIndex: number, groupIndex: number) => {
    updateGroups(ruleIndex, (groups) => groups.filter((_, gi) => gi !== groupIndex));
  };

  const handleAddSkipCondition = (ruleIndex: number, groupIndex: number) => {
    updateGroups(ruleIndex, (groups) =>
      groups.map((g, gi) =>
        gi === groupIndex
          ? { ...g, conditions: [...g.conditions, { column: "", values: [] }] }
          : g
      )
    );
  };

  const handleRemoveSkipCondition = (ruleIndex: number, groupIndex: number, condIndex: number) => {
    updateGroups(ruleIndex, (groups) =>
      groups.map((g, gi) =>
        gi === groupIndex
          ? { ...g, conditions: g.conditions.filter((_, ci) => ci !== condIndex) }
          : g
      )
    );
  };

  const handleUpdateSkipConditionColumn = (ruleIndex: number, groupIndex: number, condIndex: number, col: string) => {
    updateGroups(ruleIndex, (groups) =>
      groups.map((g, gi) =>
        gi === groupIndex
          ? {
              ...g,
              conditions: g.conditions.map((c, ci) =>
                ci === condIndex ? { ...c, column: col } : c
              ),
            }
          : g
      )
    );
  };

  const handleUpdateSkipConditionValues = (ruleIndex: number, groupIndex: number, condIndex: number, raw: string) => {
    const values = raw.split(",").map((v) => v.trim()).filter((v) => v !== "");
    updateGroups(ruleIndex, (groups) =>
      groups.map((g, gi) =>
        gi === groupIndex
          ? {
              ...g,
              conditions: g.conditions.map((c, ci) =>
                ci === condIndex ? { ...c, values } : c
              ),
            }
          : g
      )
    );
  };

  // ── Excluded Columns handlers ──
  const handleAddExcluded = (column: string) => {
    if (!excludedColumns.includes(column)) {
      onExcludedColumnsChange([...excludedColumns, column]);
    }
  };

  const handleRemoveExcluded = (column: string) => {
    onExcludedColumnsChange(excludedColumns.filter((c) => c !== column));
  };

  // ── Check Enable/Disable ──
  const effectiveChecks = enabledChecks ?? ALL_CHECKS.map((c) => c.id);

  const handleToggleCheck = (checkId: string) => {
    if (effectiveChecks.includes(checkId)) {
      onEnabledChecksChange(effectiveChecks.filter((c) => c !== checkId));
    } else {
      onEnabledChecksChange([...effectiveChecks, checkId]);
    }
  };

  // Validation
  const warnings: string[] = [];
  for (const rule of allowedValuesRules) {
    if (rule.values.length === 0) {
      warnings.push(`"${rule.column}" allowed-values list is empty — rule has no effect.`);
    }
  }
  for (const [si, srule] of skipRules.entries()) {
    if (srule.condition_groups.length === 0) {
      warnings.push(`Skip rule #${si + 1} has no condition groups — rule has no effect.`);
    }
    for (const group of srule.condition_groups) {
      for (const cond of group.conditions) {
        if (cond.column && cond.values.length === 0) {
          warnings.push(`Skip rule #${si + 1}: condition on "${cond.column}" has no trigger values.`);
        }
      }
      if (srule.dependent_column && group.conditions.some((c) => c.column === srule.dependent_column)) {
        warnings.push(`Skip rule #${si + 1}: dependent column "${srule.dependent_column}" is also a condition column.`);
      }
    }
  }
  for (const rule of rangeRules) {
    if (rule.min == null && rule.max == null) {
      warnings.push(`"${rule.column}" has no min or max — rule has no effect.`);
    }
    if (rule.min != null && rule.max != null && rule.min > rule.max) {
      warnings.push(`"${rule.column}" has min (${rule.min}) > max (${rule.max}).`);
    }
  }
  const hasInvalid = rangeRules.some(
    (r) => r.min != null && r.max != null && r.min > r.max
  );

  return (
    <div className="space-y-8">
      {/* ── Active Checks ── */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Active Checks
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Toggle which checks to run. Checks requiring unmapped fields are disabled.
        </p>
        <div className="space-y-2">
          {ALL_CHECKS.map((check) => {
            const missingFields = check.requiredFields.filter(
              (f) => !mappedFields.includes(f)
            );
            const disabled = missingFields.length > 0;
            const checked = !disabled && effectiveChecks.includes(check.id);
            return (
              <label
                key={check.id}
                className={`flex items-center gap-3 p-2 rounded-lg ${
                  disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => handleToggleCheck(check.id)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs font-mono text-gray-500 w-16">{check.id}</span>
                <span className="text-sm text-gray-800">{check.name}</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {disabled ? `needs: ${missingFields.join(", ")}` : check.description}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* ── Check Reference Guide ── */}
      <div>
        <button
          onClick={() => setGlossaryOpen(!glossaryOpen)}
          className="glossary-toggle flex items-center gap-2.5 w-full px-4 py-3 rounded-lg text-sm font-medium text-indigo-600"
        >
          {/* Book icon */}
          <svg className="w-4.5 h-4.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
          {glossaryOpen ? "Hide reference guide" : "Check reference guide"}
          {/* Chevron */}
          <svg
            className={`w-4 h-4 ml-auto transition-transform duration-200 ${glossaryOpen ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {glossaryOpen && (
          <div className="mt-4 space-y-3">
            {ALL_CHECKS.map((check, i) => {
              const isCritical = check.glossary.severity.startsWith("Critical");
              const isWarning = check.glossary.severity.startsWith("Warning");
              const severityColor = isCritical
                ? "bg-red-100 text-red-700"
                : isWarning
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-600";
              const cardSeverity = isCritical
                ? "glossary-card-critical"
                : isWarning
                  ? "glossary-card-warning"
                  : "";
              return (
                <div
                  key={check.id}
                  className={`glossary-card ${cardSeverity} rounded-lg p-4`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded font-mono text-xs font-medium">
                      {check.id}
                    </span>
                    <span className="text-sm font-semibold text-gray-800">{check.name}</span>
                    <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${severityColor}`}>
                      {check.glossary.severity}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{check.glossary.detects}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="glossary-detail-box">
                      <div className="flex items-center gap-1.5 mb-1">
                        {/* Bar chart icon */}
                        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h2v8H3zm6-4h2v12H9zm6-6h2v18h-2zm6 10h2v8h-2z" />
                        </svg>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Thresholds
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{check.glossary.thresholds}</p>
                    </div>
                    <div className="glossary-detail-box">
                      <div className="flex items-center gap-1.5 mb-1">
                        {/* Wrench icon */}
                        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75a4.5 4.5 0 0 1-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 1 1-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 0 1 6.336-4.486l-3.276 3.276a3.004 3.004 0 0 0 2.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852Z" />
                        </svg>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          What to do
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{check.glossary.remediation}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <hr className="border-gray-200" />

      {/* ── Range Rules ── */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Range Rules
        </h2>
        <p className="text-sm text-gray-500">
          Define allowed min/max bounds for numeric columns. Values outside
          these ranges will be flagged as critical by CHK-005.
        </p>
      </div>

      {rangeRules.length === 0 ? (
        <div className="text-sm text-gray-400 italic py-4">
          No rules defined. CHK-005 (Range Checks) will be skipped.
        </div>
      ) : (
        <div className="space-y-3">
          {rangeRules.map((rule, i) => (
            <div
              key={rule.column}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
            >
              <span className="text-sm font-mono font-medium text-gray-800 w-40 truncate">
                {rule.column}
              </span>
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                Min
                <input
                  type="number"
                  value={rule.min ?? ""}
                  onChange={(e) => handleUpdateRule(i, "min", e.target.value)}
                  placeholder="—"
                  className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                Max
                <input
                  type="number"
                  value={rule.max ?? ""}
                  onChange={(e) => handleUpdateRule(i, "max", e.target.value)}
                  placeholder="—"
                  className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </label>
              <button
                onClick={() => handleRemoveRule(i)}
                className="ml-auto text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
                title="Remove rule"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {availableColumns.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            id="add-rule-column"
            defaultValue=""
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            <option value="" disabled>
              Select column...
            </option>
            {availableColumns.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const select = document.getElementById(
                "add-rule-column"
              ) as HTMLSelectElement;
              if (select.value) {
                handleAddRule(select.value);
                select.value = "";
              }
            }}
            className="px-3 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            + Add Rule
          </button>
        </div>
      )}

      {numericColumns.length === 0 && (
        <p className="text-sm text-amber-600">
          No numeric columns found in the dataset. Range rules require numeric
          data.
        </p>
      )}

      <hr className="border-gray-200" />

      {/* ── Allowed Values ── */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Allowed Values
        </h2>
        <p className="text-sm text-gray-500">
          Define allowed categorical values per column. Values not in the list
          will be flagged as critical by CHK-012.
        </p>
      </div>

      {allowedValuesRules.length === 0 ? (
        <div className="text-sm text-gray-400 italic py-4">
          No allowed-value rules defined. CHK-012 will be skipped.
        </div>
      ) : (
        <div className="space-y-3">
          {allowedValuesRules.map((rule, i) => (
            <div
              key={rule.column}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
            >
              <span className="text-sm font-mono font-medium text-gray-800 w-40 truncate">
                {rule.column}
              </span>
              <input
                type="text"
                value={rule.values.join(", ")}
                onChange={(e) => handleUpdateAVValues(i, e.target.value)}
                placeholder="e.g. 1, 2, 3"
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              <button
                onClick={() => handleRemoveAVRule(i)}
                className="ml-auto text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
                title="Remove rule"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {availableAVColumns.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            id="add-av-rule-column"
            defaultValue=""
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            <option value="" disabled>
              Select column...
            </option>
            {availableAVColumns.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const select = document.getElementById(
                "add-av-rule-column"
              ) as HTMLSelectElement;
              if (select.value) {
                handleAddAVRule(select.value);
                select.value = "";
              }
            }}
            className="px-3 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            + Add Rule
          </button>
        </div>
      )}

      <hr className="border-gray-200" />

      {/* ── Skip Logic Rules ── */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Skip Logic Rules
        </h2>
        <p className="text-sm text-gray-500">
          Define skip patterns: when conditions are met, the dependent column
          must be empty. Violations are flagged as critical by CHK-006.
        </p>
      </div>

      {skipRules.length === 0 ? (
        <div className="text-sm text-gray-400 italic py-4">
          No skip rules defined. CHK-006 (Skip Logic) will be skipped.
        </div>
      ) : (
        <div className="space-y-4">
          {skipRules.map((rule, ri) => (
            <div
              key={ri}
              className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Rule #{ri + 1}
                </span>
                <button
                  onClick={() => handleRemoveSkipRule(ri)}
                  className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
                  title="Remove rule"
                >
                  &times;
                </button>
              </div>

              {/* Group logic toggle */}
              {rule.condition_groups.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Groups connected by:</span>
                  <button
                    onClick={() => handleUpdateSkipGroupLogic(ri, "AND")}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      rule.group_logic === "AND"
                        ? "bg-indigo-100 text-indigo-700 font-semibold"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    AND — all groups must match
                  </button>
                  <button
                    onClick={() => handleUpdateSkipGroupLogic(ri, "OR")}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      rule.group_logic === "OR"
                        ? "bg-amber-100 text-amber-700 font-semibold"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    OR — any group can match
                  </button>
                </div>
              )}

              {/* Condition Groups */}
              <div className="space-y-2">
                {rule.condition_groups.map((group, gi) => (
                  <div key={gi}>
                    {gi > 0 && (
                      <div className="flex items-center gap-2 pl-3 py-1">
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
                          rule.group_logic === "OR"
                            ? "text-amber-600 bg-amber-50"
                            : "text-indigo-500 bg-indigo-50"
                        }`}>
                          {rule.group_logic}
                        </span>
                        <div className="flex-1 border-t border-gray-200" />
                      </div>
                    )}
                    <div className="pl-3 py-2 space-y-1.5 border-l-2 border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                          Group {gi + 1}
                        </span>
                        {group.conditions.length > 1 && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleUpdateGroupLogic(ri, gi, "AND")}
                              className={`px-1.5 py-0.5 text-[10px] rounded ${
                                group.logic === "AND"
                                  ? "bg-indigo-100 text-indigo-700 font-semibold"
                                  : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                              }`}
                            >
                              AND
                            </button>
                            <button
                              onClick={() => handleUpdateGroupLogic(ri, gi, "OR")}
                              className={`px-1.5 py-0.5 text-[10px] rounded ${
                                group.logic === "OR"
                                  ? "bg-amber-100 text-amber-700 font-semibold"
                                  : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                              }`}
                            >
                              OR
                            </button>
                          </div>
                        )}
                        {rule.condition_groups.length > 1 && (
                          <button
                            onClick={() => handleRemoveSkipGroup(ri, gi)}
                            className="ml-auto text-gray-400 hover:text-red-500 transition-colors text-xs leading-none"
                            title="Remove group"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                      {group.conditions.map((cond, ci) => (
                        <div key={ci}>
                          {ci > 0 && (
                            <span className={`text-[10px] font-bold pl-1 block py-0.5 ${
                              group.logic === "OR" ? "text-amber-500" : "text-indigo-400"
                            }`}>{group.logic}</span>
                          )}
                          <div className="flex items-center gap-2">
                            <select
                              value={cond.column}
                              onChange={(e) => handleUpdateSkipConditionColumn(ri, gi, ci, e.target.value)}
                              className="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none w-40"
                            >
                              <option value="">Select column...</option>
                              {allColumns.map((col) => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                            </select>
                            <span className="text-xs text-gray-400">is one of</span>
                            <input
                              type="text"
                              value={cond.values.join(", ")}
                              onChange={(e) => handleUpdateSkipConditionValues(ri, gi, ci, e.target.value)}
                              placeholder="e.g. male, no"
                              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            />
                            {group.conditions.length > 1 && (
                              <button
                                onClick={() => handleRemoveSkipCondition(ri, gi, ci)}
                                className="text-gray-400 hover:text-red-500 transition-colors text-sm leading-none"
                                title="Remove condition"
                              >
                                &times;
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => handleAddSkipCondition(ri, gi)}
                        className="text-xs text-gray-500 hover:text-indigo-600"
                      >
                        + Add condition
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => handleAddSkipGroup(ri)}
                  className="ml-3 text-xs text-indigo-600 hover:text-indigo-800"
                >
                  + Add another group
                </button>
              </div>

              {/* Dependent column */}
              <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
                <span className="text-xs font-medium text-gray-600">Then</span>
                <select
                  value={rule.dependent_column}
                  onChange={(e) => handleUpdateSkipRuleDependent(ri, e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none w-40"
                >
                  <option value="">Select column...</option>
                  {allColumns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
                <span className="text-xs text-gray-500">must be empty</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleAddSkipRule}
        className="px-3 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
      >
        + Add Skip Rule
      </button>

      <hr className="border-gray-200" />

      {/* ── Excluded Columns ── */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Excluded Columns
        </h2>
        <p className="text-sm text-gray-500">
          These columns will be skipped by variable-level checks (missingness,
          outliers, range, allowed values).
        </p>
      </div>

      {excludedColumns.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {excludedColumns.map((col) => (
            <span
              key={col}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-sm text-gray-700 rounded-full"
            >
              <span className="font-mono text-xs">{col}</span>
              <button
                onClick={() => handleRemoveExcluded(col)}
                className="text-gray-400 hover:text-red-500 transition-colors leading-none"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {allColumns.filter((c) => !excludedColumns.includes(c)).length > 0 && (
        <div className="flex items-center gap-2">
          <select
            id="add-excluded-column"
            defaultValue=""
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            <option value="" disabled>
              Select column to exclude...
            </option>
            {allColumns
              .filter((c) => !excludedColumns.includes(c))
              .map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
          </select>
          <button
            onClick={() => {
              const select = document.getElementById(
                "add-excluded-column"
              ) as HTMLSelectElement;
              if (select.value) {
                handleAddExcluded(select.value);
                select.value = "";
              }
            }}
            className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            + Exclude
          </button>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="text-sm text-amber-600 space-y-1">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        {onSaveConfig && (
          <button
            onClick={onSaveConfig}
            className="btn-secondary px-4 py-2 border border-indigo-200 rounded-lg text-sm text-indigo-600 hover:bg-indigo-50"
          >
            Save Config
          </button>
        )}
        <button
          onClick={onBack}
          className="btn-secondary px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={hasInvalid}
          className="btn-primary px-5 py-2.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
        >
          Run Analysis
        </button>
      </div>
    </div>
  );
}
