import { useState } from "react";
import type { FlagRow } from "../../../shared/index";
import type { ProblemSection } from "./results/problemReview";
import { ProblemRecordCard } from "./ProblemRecordCard";

const INITIAL_VISIBLE_RECORDS = 10;

interface Props {
  section: ProblemSection;
  defaultExpanded?: boolean;
  onResolveFlags?: (flags: FlagRow[]) => void;
}

export function ProblemReviewSection({ section, defaultExpanded = false, onResolveFlags }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);

  const visibleRecords = showAll
    ? section.records
    : section.records.slice(0, INITIAL_VISIBLE_RECORDS);
  const hasMore = section.records.length > INITIAL_VISIBLE_RECORDS;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between gap-3"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-gray-900">{section.label}</span>
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 text-gray-700">
            {section.total_flags} flag{section.total_flags === 1 ? "" : "s"}
          </span>
          {section.critical_flags > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
              {section.critical_flags} critical
            </span>
          )}
          <span className="text-xs text-gray-500">
            {section.affected_records} record{section.affected_records === 1 ? "" : "s"}
            {section.affected_enumerators > 0 && (
              <> &middot; {section.affected_enumerators} enumerator{section.affected_enumerators === 1 ? "" : "s"}</>
            )}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="p-4 space-y-3 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {section.top_enumerators.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                <span className="font-medium">Top enumerators:</span>
                {section.top_enumerators.map((e) => (
                  <span
                    key={e.id}
                    className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-700"
                  >
                    <span className="font-mono">{e.id}</span>
                    <span className="ml-1 text-gray-500">({e.count})</span>
                  </span>
                ))}
              </div>
            )}
            {onResolveFlags && (
              <button
                onClick={() => {
                  const allFlags = section.records.flatMap(r => r.flags);
                  onResolveFlags(allFlags);
                }}
                className="px-3 py-1 text-xs font-medium rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Resolve All ({section.total_flags})
              </button>
            )}
          </div>

          <div className="space-y-2">
            {visibleRecords.map((group) => (
              <ProblemRecordCard key={group.id} group={group} onResolveFlags={onResolveFlags} />
            ))}
          </div>

          {hasMore && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-2 text-sm text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
            >
              Show all {section.records.length} records ({section.records.length - INITIAL_VISIBLE_RECORDS} more)
            </button>
          )}
          {hasMore && showAll && (
            <button
              onClick={() => setShowAll(false)}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
            >
              Show fewer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
