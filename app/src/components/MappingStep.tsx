import type { MappingConfig, ProfileOutput } from "../../../shared/index";

const REQUIRED_FIELDS: { key: keyof MappingConfig; label: string }[] = [
  { key: "id", label: "Row ID" },
  { key: "enumerator_id", label: "Enumerator ID" },
  { key: "survey_date", label: "Survey Date" }
];

const OPTIONAL_FIELDS: { key: keyof MappingConfig; label: string }[] = [
  { key: "module", label: "Module" }
];

const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

interface Props {
  profileResult: ProfileOutput;
  mapping: MappingConfig;
  onMappingChange: (mapping: MappingConfig) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export function MappingStep({
  profileResult,
  mapping,
  onMappingChange,
  onConfirm,
  onBack
}: Props) {
  const columns = profileResult.schema_profile.columns.map((c) => c.name);
  const selectedValues = ALL_FIELDS.map((f) => mapping[f.key]).filter(Boolean);

  const allRequiredMapped = REQUIRED_FIELDS.every((f) => mapping[f.key] !== "" && mapping[f.key] !== undefined);
  const hasDuplicates =
    new Set(selectedValues).size !== selectedValues.length;

  function renderDropdown(field: { key: keyof MappingConfig; label: string }, required: boolean) {
    const value = mapping[field.key] ?? "";
    return (
      <div key={field.key}>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {field.label}
          {!required && <span className="text-gray-400 font-normal ml-1">(optional)</span>}
        </label>
        <select
          value={value}
          onChange={(e) =>
            onMappingChange({ ...mapping, [field.key]: e.target.value || undefined })
          }
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        >
          <option value="">{required ? "— Select column —" : "— None —"}</option>
          {columns.map((col) => {
            const usedByOther = selectedValues.includes(col) && value !== col;
            return (
              <option key={col} value={col} disabled={usedByOther}>
                {col}
                {usedByOther ? " (already used)" : ""}
              </option>
            );
          })}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Map Columns</h2>
        <p className="text-sm text-gray-500">
          Map your data columns to the required fields. Matching columns are auto-guessed.
        </p>
      </div>

      <div className="grid gap-4 max-w-md">
        {REQUIRED_FIELDS.map((f) => renderDropdown(f, true))}
        {OPTIONAL_FIELDS.map((f) => renderDropdown(f, false))}
      </div>

      {hasDuplicates && (
        <p className="text-sm text-amber-600">
          Each column can only be mapped to one field.
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={!allRequiredMapped || hasDuplicates}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
        >
          Run Summary
        </button>
      </div>
    </div>
  );
}
