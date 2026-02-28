export interface MappingConfig {
  id: string;
  enumerator_id: string;
  survey_date: string;
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
