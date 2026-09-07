export interface Column {
  name: string;
  type: string;
  missing: number;
  unique: number;
  mismatches: number;
  invalid: number;
  outliers: number;
  inferred_type: string;
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
  scatter: { x: number; y: number }[];
  scatter_axes: string[];
  correlations: { left: string; right: string; coefficient: number }[];
  provenance: {
    source: "uploaded_file";
    sha256: string;
    input_bytes: number;
    file_rows: number;
    analyzed_rows: number;
    preview_rows: number;
    method_version: string;
    calculation_mode: "deterministic";
    data_values_generated: false;
  };
}
