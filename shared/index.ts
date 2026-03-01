export interface MappingConfig {
  id?: string;
  enumerator_id?: string;
  survey_date?: string;
  module?: string;
}

export interface HistogramBin {
  bin_start: number;
  bin_end: number;
  count: number;
}

export interface SummaryStatRow {
  variable: string;
  obs: number;
  mean: number | null;
  std_dev: number | null;
  min: number | null;
  max: number | null;
  percentiles: Record<string, number> | null;
  histogram: HistogramBin[] | null;
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
  by_enumerator: Record<string, number>;
  has_prior_run: boolean;
  new_flags_count: number;
  resolved_flags_count: number;
  persisting_flags_count: number;
  skipped_checks: Array<{ check_id: string; reason: string }>;
}

export interface RunMetadata {
  run_id: string;
  dataset_path: string;
  dataset_hash: string;
  config_hash: string;
  engine_version: string;
  app_version: string;
  checks_requested: string[] | "all";
  timestamp: string;
}

export interface CheckOutput {
  ok: boolean;
  flags: FlagRow[];
  summary: CheckSummary;
  run_metadata: RunMetadata;
}

export interface DailyCompletion {
  date: string;
  count: number;
  cumulative: number;
}

export interface EnumeratorStat {
  enumerator_id: string;
  total_surveys: number;
  first_date: string;
  last_date: string;
  active_days: number;
  surveys_per_day: number;
  avg_duration: number | null;
  median_duration: number | null;
  min_duration: number | null;
  max_duration: number | null;
  flag_count: number;
}

export interface DurationStats {
  column: string;
  overall_mean: number;
  overall_median: number;
  overall_std: number | null;
  overall_min: number;
  overall_max: number;
  histogram: HistogramBin[];
}

export interface PerformanceTotals {
  total_surveys: number;
  total_enumerators: number;
  date_range_days: number;
  first_date: string | null;
  last_date: string | null;
}

export interface DailyByEnumerator {
  date: string;
  enumerator_id: string;
  count: number;
}

export interface PerformanceOutput {
  ok: boolean;
  daily_completions: DailyCompletion[];
  enumerator_stats: EnumeratorStat[];
  duration_stats: DurationStats | null;
  daily_by_enumerator: DailyByEnumerator[] | null;
  totals: PerformanceTotals | null;
  warnings: string[];
  errors: string[];
}

export interface RangeRule {
  column: string;
  min?: number | null;
  max?: number | null;
}

export interface ProjectConfig {
  version: "1";
  mapping: MappingConfig;
  range_rules: RangeRule[];
}
