import type { ProfileOutput, RangeRule } from "../../../shared/index";

interface Props {
  profileResult: ProfileOutput;
  rangeRules: RangeRule[];
  onRulesChange: (rules: RangeRule[]) => void;
  onConfirm: () => void;
  onBack: () => void;
  onSaveConfig?: () => void;
}

function getNumericColumns(profile: ProfileOutput): string[] {
  return profile.schema_profile.columns
    .filter((c) => /int|float/.test(c.dtype))
    .map((c) => c.name);
}

export function RulesStep({
  profileResult,
  rangeRules,
  onRulesChange,
  onConfirm,
  onBack,
  onSaveConfig,
}: Props) {
  const numericColumns = getNumericColumns(profileResult);
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

  // Validation
  const warnings: string[] = [];
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
    <div className="space-y-6">
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
