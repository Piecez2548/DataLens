export interface Column {
  name: string;
  type: string;
  missing: number;
  unique: number;
  mismatches: number;
  invalid: number;
  outliers: number;
  inferred_type: string;
  format: "currency" | "percent" | null;
  pattern: "thai_national_id" | "thai_phone" | null;
  type_overridden: boolean;
  stats: Record<string, number> | null;
  histogram: { label: string; count: number }[];
  categories: { label: string; count: number }[];
}
export interface Analysis {
  filename: string;
  rows: number;
  column_count: number;
  missing: number;
  duplicates: number;
  scores: Record<string, number | null>;
  header: {
    mode: "auto" | "present" | "absent";
    detected: boolean;
    used: boolean;
    generated_names: boolean;
    configured_names: boolean;
  };
  executive: {
    status: "Ready for exploration" | "Review needed" | "Action required";
    message: string;
    quality_score: number;
    issue_count: number;
    high_priority_count: number;
    issues: {
      severity: "high" | "medium" | "info";
      title: string;
      detail: string;
      recommendation: string;
    }[];
    scope_note: string;
    signals: string[];
  };
  columns: Column[];
  preview: Record<string, string | null>[];
  key_duplicates: {
    columns: string[];
    duplicate_rows: number;
    blank_key_rows: number;
  } | null;
  group_summary: {
    by: string;
    measure: string | null;
    total_groups: number;
    truncated: boolean;
    rows: {
      group: string;
      rows: number;
      sum: number | null;
      mean: number | null;
      min: number | null;
      max: number | null;
    }[];
  } | null;
  issue_samples: {
    row_label: "row" | "record";
    max_examples: number;
    kinds: Record<
      string,
      {
        total: number;
        examples: {
          row: number;
          column: string | null;
          value: string | null;
          reason: string;
        }[];
      }
    >;
  };
  timeseries: {
    column: string;
    granularity: "day" | "month" | "year";
    first: string;
    last: string;
    gaps: number;
    points: { label: string; count: number }[];
  } | null;
  scatter: { x: number; y: number }[];
  scatter_axes: string[];
  correlations: { left: string; right: string; coefficient: number }[];
  business_rules: {
    configured: boolean;
    passed: boolean;
    total_violations: number;
    results: {
      column: string;
      rule: string;
      threshold?: number;
      checked: number;
      violations: number;
    }[];
  };
  governance: {
    analysis_id: string;
    retention: "request_only";
    server_storage: false;
    cache_control: "no-store";
    declared: Record<string, string | boolean>;
  };
  audit_event: AuditEvent;
  provenance: {
    source: "uploaded_file";
    sha256: string;
    input_bytes: number;
    file_rows: number;
    analyzed_rows: number;
    preview_rows: number;
    method_version: string;
    source_format: "csv" | "xlsx" | "json";
    sheet: string | null;
    sheets: string[] | null;
    header_row: number | null;
    header_row_suggestion: number | null;
    date_order: "dmy" | "mdy";
    date_order_ambiguous: boolean;
    encoding: string;
    delimiter: string | null;
    missing_markers: string[];
    calculation_mode: "deterministic";
    data_values_generated: false;
  };
}

export interface AuditEvent {
  event_version: number;
  action: string;
  analysis_id: string;
  timestamp: number;
  details: Record<string, unknown>;
  signature: string;
  signature_algorithm: "HMAC-SHA256";
}

export interface BusinessRule {
  required?: boolean;
  min?: number;
  max?: number;
  allowed_values?: string[];
}
