import { useState } from "react";
import type { DurationMapping, MappingConfig, ProfileOutput } from "../../../shared/index";

const FIELD_TOOLTIPS: Record<keyof MappingConfig, string> = {
  id: "Unique row identifier. Used by CHK-001 (Duplicate ID), CHK-005 (Range), CHK-008 (Outlier), CHK-012 (Allowed Values).",
  enumerator_id: "Enumerator/interviewer ID. Used by CHK-004 (Missingness by Enumerator), CHK-009 (Enumerator Anomaly Rate).",
  survey_date: "Date of interview. Used for performance metrics (daily completions, active days, date range).",
  module: "Survey module/section. Shown in flag details for context.",
};

const SKIP_CHECKS: Record<keyof MappingConfig, string[]> = {
  id: ["CHK-001 (Duplicate ID)"],
  enumerator_id: ["CHK-004 (Missingness by Enumerator)", "CHK-009 (Enumerator Anomaly Rate)"],
  survey_date: ["Performance metrics (daily completions, enumerator stats)"],
  module: [],
};

const RECOMMENDED_FIELDS: { key: keyof MappingConfig; label: string }[] = [
  { key: "id", label: "Row ID" },
  { key: "enumerator_id", label: "Enumerator ID" },
  { key: "survey_date", label: "Survey Date" },
];

const OPTIONAL_FIELDS: { key: keyof MappingConfig; label: string }[] = [
  { key: "module", label: "Module" },
];

const ALL_FIELDS = [...RECOMMENDED_FIELDS, ...OPTIONAL_FIELDS];

interface Props {
  profileResult: ProfileOutput;
  mapping: MappingConfig;
  onMappingChange: (mapping: MappingConfig) => void;
  durationMapping: DurationMapping;
  onDurationMappingChange: (dm: DurationMapping) => void;
  onConfirm: () => void;
  onBack: () => void;
  onLoadConfig?: () => void;
}

export function MappingStep({
  profileResult,
  mapping,
  onMappingChange,
  durationMapping,
  onDurationMappingChange,
  onConfirm,
  onBack,
  onLoadConfig,
}: Props) {
  const columns = profileResult.schema_profile.columns;
  const columnNames = columns.map((c) => c.name);
  const columnMap = new Map(columns.map((c) => [c.name, c]));
  const selectedValues = ALL_FIELDS.map((f) => mapping[f.key]).filter(Boolean);

  const anyFieldMapped = selectedValues.length > 0;
  const unmappedRecommended = RECOMMENDED_FIELDS.filter((f) => !mapping[f.key]);
  const hasDuplicates = new Set(selectedValues).size !== selectedValues.length;

  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  function renderDropdown(field: { key: keyof MappingConfig; label: string }, recommended: boolean) {
    const value = mapping[field.key] ?? "";
    const colProfile = value ? columnMap.get(value) : null;
    const samples = colProfile?.sample_values;

    return (
      <div key={field.key}>
        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
          {field.label}
          {recommended
            ? <span className="text-blue-500 font-normal">(recommended)</span>
            : <span className="text-gray-400 font-normal">(optional)</span>}
          <button
            type="button"
            className="relative w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] leading-none hover:bg-gray-300"
            onMouseEnter={() => setShowTooltip(field.key)}
            onMouseLeave={() => setShowTooltip(null)}
          >
            ?
            {showTooltip === field.key && (
              <div className="absolute left-6 top-0 z-10 w-64 p-2 text-xs font-normal text-gray-700 bg-white border border-gray-200 rounded-lg shadow-lg">
                {FIELD_TOOLTIPS[field.key]}
              </div>
            )}
          </button>
        </label>
        <select
          value={value}
          onChange={(e) =>
            onMappingChange({ ...mapping, [field.key]: e.target.value || undefined })
          }
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        >
          <option value="">— None —</option>
          {columnNames.map((col) => {
            const usedByOther = selectedValues.includes(col) && value !== col;
            return (
              <option key={col} value={col} disabled={usedByOther}>
                {col}
                {usedByOther ? " (already used)" : ""}
              </option>
            );
          })}
        </select>
        {/* Column preview: first 5 sample values */}
        {samples && samples.length > 0 && (
          <p className="mt-1 text-xs text-gray-400 truncate">
            e.g. {samples.slice(0, 5).join(", ")}
          </p>
        )}
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
        {RECOMMENDED_FIELDS.map((f) => renderDropdown(f, true))}
        {OPTIONAL_FIELDS.map((f) => renderDropdown(f, false))}
      </div>

      {hasDuplicates && (
        <p className="text-sm text-amber-600">
          Each column can only be mapped to one field.
        </p>
      )}

      {unmappedRecommended.length > 0 && !hasDuplicates && (
        <div className="text-sm text-amber-600">
          <p className="mb-1">
            Unmapped: {unmappedRecommended.map((f) => f.label).join(", ")}
          </p>
          <ul className="list-disc list-inside text-xs text-amber-500">
            {unmappedRecommended
              .flatMap((f) => SKIP_CHECKS[f.key])
              .filter(Boolean)
              .map((check) => (
                <li key={check}>Will skip: {check}</li>
              ))}
          </ul>
        </div>
      )}

      {/* Duration mapping section */}
      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Duration
          <span className="text-gray-400 font-normal ml-1">(optional — for CHK-010)</span>
        </h3>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="duration_mode"
              checked={durationMapping.mode === "column"}
              onChange={() => onDurationMappingChange({ ...durationMapping, mode: "column" })}
              className="accent-blue-600"
            />
            I have a duration column
          </label>

          {durationMapping.mode === "column" && (
            <div className="ml-6 space-y-2 max-w-sm">
              <select
                value={durationMapping.duration_column ?? ""}
                onChange={(e) => onDurationMappingChange({ ...durationMapping, duration_column: e.target.value || undefined })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">— Select column —</option>
                {columnNames.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="duration_unit"
                    checked={durationMapping.duration_unit !== "seconds"}
                    onChange={() => onDurationMappingChange({ ...durationMapping, duration_unit: "minutes" })}
                    className="accent-blue-600"
                  />
                  Minutes
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="duration_unit"
                    checked={durationMapping.duration_unit === "seconds"}
                    onChange={() => onDurationMappingChange({ ...durationMapping, duration_unit: "seconds" })}
                    className="accent-blue-600"
                  />
                  Seconds
                </label>
              </div>
              {durationMapping.duration_column && (
                <p className="text-xs text-gray-400">
                  e.g. {columnMap.get(durationMapping.duration_column)?.sample_values?.slice(0, 3).join(", ") ?? "—"}
                </p>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="duration_mode"
              checked={durationMapping.mode === "start_end"}
              onChange={() => onDurationMappingChange({ ...durationMapping, mode: "start_end" })}
              className="accent-blue-600"
            />
            I have start and end time columns
          </label>

          {durationMapping.mode === "start_end" && (
            <div className="ml-6 space-y-2 max-w-sm">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Start time</label>
                <select
                  value={durationMapping.start_column ?? ""}
                  onChange={(e) => onDurationMappingChange({ ...durationMapping, start_column: e.target.value || undefined })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">— Select column —</option>
                  {columnNames.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">End time</label>
                <select
                  value={durationMapping.end_column ?? ""}
                  onChange={(e) => onDurationMappingChange({ ...durationMapping, end_column: e.target.value || undefined })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">— Select column —</option>
                  {columnNames.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="duration_mode"
              checked={durationMapping.mode === "none"}
              onChange={() => onDurationMappingChange({ mode: "none" })}
              className="accent-blue-600"
            />
            No duration data
            <span className="text-xs text-gray-400">(skips CHK-010)</span>
          </label>
        </div>
      </div>

      <div className="flex gap-3">
        {onLoadConfig && (
          <button
            onClick={onLoadConfig}
            className="px-4 py-2 border border-blue-300 rounded-lg text-sm text-blue-700 hover:bg-blue-50 transition-colors"
          >
            Load Config
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
          disabled={!anyFieldMapped || hasDuplicates}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
