import type { AllowedValuesRule, ProfileOutput, RangeRule } from "../../../shared/index";

interface Props {
  profileResult: ProfileOutput;
  rangeRules: RangeRule[];
  onRulesChange: (rules: RangeRule[]) => void;
  allowedValuesRules: AllowedValuesRule[];
  onAllowedValuesChange: (rules: AllowedValuesRule[]) => void;
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
}> = [
  { id: "CHK-001", name: "Duplicate ID", description: "Flag duplicate survey IDs", requiredFields: ["id"] },
  { id: "CHK-002", name: "Missingness by Variable", description: "Flag columns with high missing rates", requiredFields: [] },
  { id: "CHK-004", name: "Missingness by Enumerator", description: "Flag enumerators with unusual missing rates", requiredFields: ["enumerator_id"] },
  { id: "CHK-005", name: "Range Check", description: "Flag values outside min/max bounds", requiredFields: [] },
  { id: "CHK-008", name: "Outlier Z-score", description: "Flag statistical outliers in numeric columns", requiredFields: [] },
  { id: "CHK-010", name: "Duration Anomaly", description: "Flag unusually short/long surveys", requiredFields: ["survey_date"] },
  { id: "CHK-012", name: "Allowed Values", description: "Flag values not in allowed set", requiredFields: [] },
  { id: "CHK-009", name: "Enumerator Anomaly Rate", description: "Flag enumerators with high flag rates", requiredFields: ["enumerator_id"] },
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
  excludedColumns,
  onExcludedColumnsChange,
  enabledChecks,
  onEnabledChecksChange,
  mappedFields,
  onConfirm,
  onBack,
  onSaveConfig,
}: Props) {
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
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
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
                  className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                Max
                <input
                  type="number"
                  value={rule.max ?? ""}
                  onChange={(e) => handleUpdateRule(i, "max", e.target.value)}
                  placeholder="—"
                  className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
            className="px-3 py-2 text-sm font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
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
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
            className="px-3 py-2 text-sm font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
          >
            + Add Rule
          </button>
        </div>
      )}

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
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
            className="px-4 py-2 border border-blue-300 rounded-lg text-sm text-blue-700 hover:bg-blue-50 transition-colors"
          >
            Save Config
          </button>
        )}
        <button
          onClick={onBack}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={hasInvalid}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
        >
          Run Analysis
        </button>
      </div>
    </div>
  );
}
