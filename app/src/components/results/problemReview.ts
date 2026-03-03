import type { FlagRow } from "../../../../shared/index";

export type ProblemRecordGroup = {
  id: string;
  enumerator_id: string;
  flags: FlagRow[];
};

export type ProblemSection = {
  key: string;
  label: string;
  total_flags: number;
  critical_flags: number;
  affected_records: number;
  affected_enumerators: number;
  top_enumerators: Array<{ id: string; count: number }>;
  records: ProblemRecordGroup[];
};

type CategoryDef = { key: string; label: string; check_ids: string[] };

const PROBLEM_CATEGORIES: CategoryDef[] = [
  { key: "duration", label: "Duration", check_ids: ["CHK-010"] },
  { key: "missingness", label: "Missingness", check_ids: ["CHK-002", "CHK-004"] },
  { key: "outliers", label: "Outliers", check_ids: ["CHK-008"] },
  { key: "range", label: "Range", check_ids: ["CHK-005"] },
  { key: "skip_logic", label: "Skip Logic", check_ids: ["CHK-006"] },
  { key: "duplicate_id", label: "Duplicate / ID", check_ids: ["CHK-001"] },
  { key: "enumerator_risk", label: "Enumerator Risk", check_ids: ["CHK-009"] },
];

const checkIdToCategory = new Map<string, CategoryDef>();
for (const cat of PROBLEM_CATEGORIES) {
  for (const id of cat.check_ids) {
    checkIdToCategory.set(id, cat);
  }
}

const OTHER_CATEGORY: CategoryDef = { key: "other", label: "Other", check_ids: [] };

export function categoryForCheckId(checkId: string): string {
  return (checkIdToCategory.get(checkId) ?? OTHER_CATEGORY).label;
}

export function buildProblemSections(flags: FlagRow[]): ProblemSection[] {
  const grouped = new Map<string, FlagRow[]>();

  for (const flag of flags) {
    const cat = checkIdToCategory.get(flag.check_id) ?? OTHER_CATEGORY;
    const existing = grouped.get(cat.key) ?? [];
    existing.push(flag);
    grouped.set(cat.key, existing);
  }

  const sections: ProblemSection[] = [];

  for (const [key, catFlags] of grouped) {
    const catDef = PROBLEM_CATEGORIES.find((c) => c.key === key) ?? OTHER_CATEGORY;

    const recordMap = new Map<string, ProblemRecordGroup>();
    const enumeratorCounts = new Map<string, number>();
    let criticalFlags = 0;
    const uniqueRecords = new Set<string>();
    const uniqueEnumerators = new Set<string>();

    for (const flag of catFlags) {
      if (flag.severity === "critical") criticalFlags++;

      const recordKey = flag.id || "Unknown";
      uniqueRecords.add(recordKey);

      if (flag.enumerator_id) {
        uniqueEnumerators.add(flag.enumerator_id);
        enumeratorCounts.set(flag.enumerator_id, (enumeratorCounts.get(flag.enumerator_id) ?? 0) + 1);
      }

      const existing = recordMap.get(recordKey);
      if (existing) {
        existing.flags.push(flag);
        if (!existing.enumerator_id && flag.enumerator_id) existing.enumerator_id = flag.enumerator_id;
      } else {
        recordMap.set(recordKey, {
          id: recordKey,
          enumerator_id: flag.enumerator_id,
          flags: [flag],
        });
      }
    }

    const records = [...recordMap.values()].sort((a, b) => {
      const critA = a.flags.filter((f) => f.severity === "critical").length;
      const critB = b.flags.filter((f) => f.severity === "critical").length;
      return critB - critA || b.flags.length - a.flags.length || a.id.localeCompare(b.id);
    });

    const topEnumerators = [...enumeratorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, count]) => ({ id, count }));

    sections.push({
      key,
      label: catDef.label,
      total_flags: catFlags.length,
      critical_flags: criticalFlags,
      affected_records: uniqueRecords.size,
      affected_enumerators: uniqueEnumerators.size,
      top_enumerators: topEnumerators,
      records,
    });
  }

  return sections.sort((a, b) =>
    b.critical_flags - a.critical_flags ||
    b.total_flags - a.total_flags ||
    a.label.localeCompare(b.label)
  );
}
