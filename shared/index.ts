export interface MappingConfig {
  id?: string;
  enumerator_id?: string;
  survey_date?: string;
  module?: string;
}

export interface SummaryStatRow {
  variable: string;
  obs: number;
  mean: number | null;
  std_dev: number | null;
  min: number | null;
  max: number | null;
}

export interface SchemaColumnProfile {
  name: string;
  dtype: string;
  missing_count: number;
  non_missing_count: number;
}

export interface ProfileOutput {
  ok: boolean;
  schema_profile: {
    row_count: number;
    column_count: number;
    columns: SchemaColumnProfile[];
  };
  warnings: string[];
  errors: string[];
}

export interface SummaryOutput {
  ok: boolean;
  summary_stats: SummaryStatRow[];
  mapping: MappingConfig;
  defaults: { outlier_method: string; zscore_threshold: number };
  warnings: string[];
  errors: string[];
}

export interface FlagRow {
  run_id: string;
  check_id: string;
  check_name: string;
  severity: string;
  status: string;
  id: string;
  enumerator_id: string;
  module: string;
  column_name: string;
  observed_value: string;
  rule_reference: string;
  message: string;
  created_at: string;
}

export interface CheckSummary {
  run_id: string;
  total_flags: number;
  by_severity: Record<string, number>;
  by_check: Record<string, number>;
  skipped_checks: Array<{ check_id: string; reason: string }>;
}

export interface CheckOutput {
  ok: boolean;
  flags: FlagRow[];
  summary: CheckSummary;
}

export interface RangeRule {
  column: string;
  min?: number | null;
  max?: number | null;
}
