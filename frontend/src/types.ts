export interface Column {
  name: string;
  type: string;
  missing: number;
  unique: number;
  mismatches: number;
  invalid: number;
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
  columns: Column[];
  preview: Record<string, string | null>[];
  scatter: { x: number; y: number }[];
  scatter_axes: string[];
}
