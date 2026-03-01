import type { ProblemRecordGroup } from "./results/problemReview";

interface Props {
  group: ProblemRecordGroup;
}

export function ProblemRecordCard({ group }: Props) {
  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-gray-900">
          Record <span className="font-mono text-xs">{group.id}</span>
        </span>
        {group.enumerator_id && (
          <span className="text-xs text-gray-500">
            Enumerator: <span className="font-mono">{group.enumerator_id}</span>
          </span>
        )}
        {group.module && (
          <span className="text-xs text-gray-500">
            Module: <span className="font-mono">{group.module}</span>
          </span>
        )}
        <span className="text-xs text-gray-500">
          {group.flags.length} flag{group.flags.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        {group.flags.map((flag, index) => (
          <div
            key={`${group.id}-${flag.check_id}-${flag.column_name}-${index}`}
            className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[160px_110px_1fr] gap-3"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">{flag.check_name}</p>
              <p className="text-[11px] font-mono text-gray-400">{flag.check_id}</p>
            </div>
            <div className="space-y-1">
              <span
                className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                  flag.severity === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {flag.severity}
              </span>
              <p className="font-mono text-xs text-gray-500">{flag.column_name || "\u2014"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-700">{flag.message}</p>
              <p className="text-xs text-gray-500">
                Observed value: <span className="font-mono">{flag.observed_value || "\u2014"}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
