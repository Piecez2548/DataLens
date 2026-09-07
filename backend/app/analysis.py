"""Deterministic CSV profiling. All scores describe inferred rules, not truth."""

import csv
import io
import re
from collections import Counter

import numpy as np
import pandas as pd

MAX_BYTES = 10 * 1024 * 1024
MAX_ROWS = 100_000
MAX_COLUMNS = 100


def analyze(content: bytes, filename: str) -> dict:
    if len(content) > MAX_BYTES:
        raise ValueError("CSV exceeds the 10 MB limit.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("Use a UTF-8 encoded CSV file.") from exc
    if "\x00" in text:
        raise ValueError("The file contains binary data.")
    try:
        reader = csv.reader(io.StringIO(text), strict=True)
        headers = next(reader)
        if not headers or any(not h.strip() for h in headers):
            raise ValueError("Every column needs a non-empty header.")
        headers = [h.strip() for h in headers]
        if len(set(headers)) != len(headers):
            raise ValueError("Column names must be unique.")
        if len(headers) > MAX_COLUMNS:
            raise ValueError("Maximum 100 columns supported.")
        rows = []
        for row in reader:
            if not row:
                continue
            if len(row) != len(headers):
                raise ValueError("Every row must have the same number of fields as the header.")
            rows.append(row)
            if len(rows) > MAX_ROWS:
                raise ValueError("Maximum 100,000 rows supported.")
    except (StopIteration, csv.Error) as exc:
        raise ValueError("The CSV is empty or malformed.") from exc
    if not rows:
        raise ValueError("The CSV must contain at least one data row.")
    frame = pd.DataFrame(rows, columns=headers)
    normalized = frame.apply(lambda col: col.str.strip().replace("", None))
    n = len(frame)
    columns, numeric = [], {}
    mismatches = invalid = checked = 0
    for name in headers:
        values = normalized[name].dropna()

        def kind(value):
            if value.lower() in {"true", "false"}:
                return "boolean"
            if re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[+-]?(?:inf(?:inity)?|nan)", value, re.I):
                return "numeric"
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                return "datetime"
            return "categorical"

        kinds = values.map(kind)
        counts = Counter(kinds)
        dominant = counts.most_common(1)[0][0] if counts else "empty"
        dtype = dominant if counts and counts[dominant] / len(values) >= 0.8 else "categorical"
        mismatch = int((kinds != dtype).sum()) if dtype not in {"categorical", "empty"} else 0
        matched = values[kinds == dtype]
        bad = 0
        stats = None
        histogram = []
        if dtype == "numeric":
            parsed = pd.to_numeric(matched, errors="coerce").astype(float)
            good = parsed[np.isfinite(parsed)]
            bad = len(parsed) - len(good)
            numeric[name] = pd.to_numeric(normalized[name], errors="coerce").replace([np.inf, -np.inf], np.nan)
            if len(good):
                stats = {
                    "count": len(good),
                    "min": float(good.min()),
                    "max": float(good.max()),
                    "mean": float(good.mean()),
                    "median": float(good.median()),
                    "std": float(good.std(ddof=0)),
                }
                heights, edges = np.histogram(good, bins=min(12, max(1, int(np.sqrt(len(good))))))
                histogram = [
                    {"label": f"{edges[i]:.3g}–{edges[i + 1]:.3g}", "count": int(count)}
                    for i, count in enumerate(heights)
                ]
        elif dtype == "datetime":
            bad = int(pd.to_datetime(matched, format="%Y-%m-%d", errors="coerce").isna().sum())
        if dtype in {"numeric", "datetime", "boolean"}:
            checked += len(matched)
            invalid += bad
        mismatches += mismatch
        columns.append(
            {
                "name": name,
                "type": dtype,
                "missing": int(normalized[name].isna().sum()),
                "unique": int(values.nunique()),
                "mismatches": mismatch,
                "invalid": bad,
                "stats": stats,
                "histogram": histogram,
                "categories": [{"label": str(k), "count": int(v)} for k, v in values.value_counts().head(10).items()],
            }
        )
    missing = int(normalized.isna().sum().sum())
    present = n * len(headers) - missing
    duplicates = int(normalized.duplicated().sum())
    scores = {
        "Completeness": 100 * (1 - missing / (n * len(headers))),
        "Consistency": 100 * (1 - mismatches / present) if present else None,
        "Uniqueness": 100 * (1 - duplicates / n),
        "Validity": 100 * (1 - invalid / checked) if checked else None,
    }
    available = [v for v in scores.values() if v is not None]
    scores["Overall"] = sum(available) / len(available)
    numeric_names = list(numeric)
    scatter = []
    if len(numeric_names) >= 2:
        pairs = pd.DataFrame({"x": numeric[numeric_names[0]], "y": numeric[numeric_names[1]]}).dropna()
        scatter = pairs.head(500).to_dict("records")
    return {
        "filename": filename,
        "rows": n,
        "column_count": len(headers),
        "missing": missing,
        "duplicates": duplicates,
        "scores": {k: round(v, 2) if v is not None else None for k, v in scores.items()},
        "columns": columns,
        "preview": normalized.head(100).where(normalized.head(100).notna(), None).to_dict("records"),
        "scatter": scatter,
        "scatter_axes": numeric_names[:2],
    }
