"""Deterministic CSV profiling. All scores describe inferred rules, not truth."""

import csv
import hashlib
import io
import re
from collections import Counter

import numpy as np
import pandas as pd

MAX_BYTES = 10 * 1024 * 1024
MAX_ROWS = 100_000
MAX_COLUMNS = 100
ALLOWED_TYPES = {"numeric", "categorical", "datetime", "boolean", "email", "identifier"}
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _detect_header(text: str) -> bool:
    """Use Python's conservative structural heuristic on a bounded sample."""
    try:
        if csv.Sniffer().has_header(text[:8192]):
            return True
    except csv.Error:
        pass
    rows = csv.reader(io.StringIO(text))
    first = next(rows, [])
    second = next(rows, [])
    common_labels = {
        "id",
        "name",
        "first_name",
        "last_name",
        "email",
        "date",
        "time",
        "amount",
        "value",
        "group",
        "category",
        "country",
        "region",
        "status",
        "type",
        "description",
        "quantity",
        "price",
        "revenue",
    }
    normalized = [cell.strip().lower().replace(" ", "_") for cell in first]
    label_shaped = all(re.fullmatch(r"[a-z_][a-z0-9_-]*", cell) for cell in normalized)
    data_shaped_second_row = any(
        re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?", cell.strip())
        or re.fullmatch(r"\d{4}-\d{2}-\d{2}", cell.strip())
        for cell in second
    )
    return bool(label_shaped and (any(cell in common_labels for cell in normalized) or data_shaped_second_row))


def _executive_summary(
    *,
    scores: dict,
    missing: int,
    duplicates: int,
    rows: int,
    mismatches: int,
    invalid: int,
    header_detected: bool,
    outliers: int,
    correlations: list[dict],
    embedded_delimiters: list[str],
) -> dict:
    issues = []
    if not header_detected:
        issues.append(
            {
                "severity": "medium",
                "title": "Column names are missing",
                "detail": "The first row appears to contain data, so neutral column names were generated.",
                "recommendation": "Rename columns before sharing or connecting this dataset to reporting tools.",
            }
        )
    if missing:
        ratio = missing / max(1, rows)
        issues.append(
            {
                "severity": "high" if ratio >= 0.05 else "medium",
                "title": f"{missing:,} missing cells need review",
                "detail": "Blank values can change totals, averages, and segment counts.",
                "recommendation": "Confirm whether blanks mean unknown, not applicable, or a data collection failure.",
            }
        )
    if duplicates:
        issues.append(
            {
                "severity": "high" if duplicates / rows >= 0.02 else "medium",
                "title": f"{duplicates:,} duplicate rows may overstate results",
                "detail": "Repeated records can inflate counts and monetary totals.",
                "recommendation": "Confirm the business key, then remove only records proven to be duplicates.",
            }
        )
    if mismatches:
        issues.append(
            {
                "severity": "medium",
                "title": f"{mismatches:,} values conflict with their column type",
                "detail": "Mixed types can break sorting, aggregation, and downstream imports.",
                "recommendation": "Standardize the flagged values before analysis.",
            }
        )
    if invalid:
        issues.append(
            {
                "severity": "high",
                "title": f"{invalid:,} typed values are invalid",
                "detail": "These values match the expected shape but fail a basic validity check.",
                "recommendation": "Correct or exclude the invalid values with an auditable rule.",
            }
        )
    if outliers:
        issues.append(
            {
                "severity": "info",
                "title": f"{outliers:,} statistical outliers deserve context",
                "detail": "IQR flags unusual numeric values; unusual does not automatically mean incorrect.",
                "recommendation": "Ask the data owner whether these represent valid edge cases, errors, or exceptional events.",
            }
        )
    if embedded_delimiters:
        names = ", ".join(embedded_delimiters[:3])
        issues.append(
            {
                "severity": "medium",
                "title": "Possible fields embedded inside one CSV column",
                "detail": f"Repeated pipe delimiters were found in: {names}.",
                "recommendation": "Confirm whether each pipe-separated field needs its own CSV column before reporting.",
            }
        )
    high = sum(item["severity"] == "high" for item in issues)
    if high:
        status, message = "Action required", "Resolve high-impact data risks before executive reporting."
    elif issues:
        status, message = "Review needed", "The dataset is usable for exploration after the listed checks."
    else:
        status, message = "Ready for exploration", "No structural issues were found by the supported checks."
    return {
        "status": status,
        "message": message,
        "quality_score": round(scores["Overall"], 2),
        "issue_count": len(issues),
        "high_priority_count": high,
        "issues": issues[:6],
        "signals": [
            f"Observed Pearson coefficient in this file: {pair['left']} ↔ {pair['right']} ({pair['coefficient']:+.2f})."
            for pair in correlations[:1]
        ],
        "scope_note": "Automated structural checks only; business accuracy still requires an accountable owner.",
    }


def analyze(
    content: bytes,
    filename: str,
    header_mode: str = "auto",
    column_names: list[str] | None = None,
    type_overrides: dict[str, str] | None = None,
) -> dict:
    if len(content) > MAX_BYTES:
        raise ValueError("CSV exceeds the 10 MB limit.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("Use a UTF-8 encoded CSV file.") from exc
    if "\x00" in text:
        raise ValueError("The file contains binary data.")
    if header_mode not in {"auto", "present", "absent"}:
        raise ValueError("header_mode must be auto, present, or absent.")
    try:
        reader = csv.reader(io.StringIO(text), strict=True)
        all_rows = [row for row in reader if row]
        if not all_rows:
            raise ValueError("The CSV is empty or malformed.")
        width = len(all_rows[0])
        if width > MAX_COLUMNS:
            raise ValueError("Maximum 100 columns supported.")
        if any(len(row) != width for row in all_rows):
            raise ValueError("Every row must have the same number of fields.")
        detected_header = _detect_header(text)
        use_header = detected_header if header_mode == "auto" else header_mode == "present"
        if use_header:
            headers = [h.strip() for h in all_rows[0]]
            rows = all_rows[1:]
        else:
            headers = [f"column_{index + 1}" for index in range(width)]
            rows = all_rows
        if column_names is not None:
            if not isinstance(column_names, list) or not all(isinstance(name, str) for name in column_names):
                raise ValueError("Column names must be a list of text values.")
            if len(column_names) != width:
                raise ValueError("The number of column names must match the CSV width.")
            headers = [name.strip() for name in column_names]
            if any(not name for name in headers):
                raise ValueError("Column names cannot be empty.")
        if use_header and (not headers or any(not h for h in headers)):
            raise ValueError("Every column needs a non-empty header.")
        if len(set(headers)) != len(headers):
            raise ValueError("Column names must be unique.")
        if len(rows) > MAX_ROWS:
            raise ValueError("Maximum 100,000 rows supported.")
    except (StopIteration, csv.Error) as exc:
        raise ValueError("The CSV is empty or malformed.") from exc
    if not rows:
        raise ValueError("The CSV must contain at least one data row.")
    frame = pd.DataFrame(rows, columns=headers)
    normalized = frame.apply(lambda col: col.str.strip().replace("", None))
    n = len(frame)
    type_overrides = type_overrides or {}
    if not isinstance(type_overrides, dict) or not all(
        isinstance(name, str) and isinstance(value, str) for name, value in type_overrides.items()
    ):
        raise ValueError("Type overrides must map column names to supported types.")
    unknown_overrides = set(type_overrides) - set(headers)
    invalid_override_types = set(type_overrides.values()) - ALLOWED_TYPES
    if unknown_overrides or invalid_override_types:
        raise ValueError("Schema overrides contain an unknown column or type.")
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
        inferred = dominant if counts and counts[dominant] / len(values) >= 0.8 else "categorical"
        normalized_name = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
        email_hits = int(values.map(lambda value: bool(EMAIL_PATTERN.fullmatch(value))).sum())
        if values.size and ("email" in normalized_name or email_hits / len(values) >= 0.8):
            inferred = "email"
        numeric_values = pd.to_numeric(values, errors="coerce")
        sequential_identifier = (
            len(values) >= 3
            and numeric_values.notna().all()
            and values.nunique() == len(values)
            and np.allclose(np.diff(numeric_values.astype(float)), 1)
        )
        if normalized_name in {"id", "customer_id", "record_id", "user_id"} or sequential_identifier:
            inferred = "identifier"
        dtype = type_overrides.get(name, inferred)
        if dtype == "email":
            mismatch = 0
            matched = values
        elif dtype == "identifier":
            mismatch = 0
            matched = values
        else:
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
        elif dtype == "email":
            bad = int((~matched.map(lambda value: bool(EMAIL_PATTERN.fullmatch(value)))).sum())
        if dtype in {"numeric", "datetime", "boolean", "email"}:
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
                "outliers": 0,
                "inferred_type": inferred,
                "type_overridden": name in type_overrides,
                "stats": stats,
                "histogram": histogram,
                "categories": [{"label": str(k), "count": int(v)} for k, v in values.value_counts().head(10).items()],
            }
        )
        if dtype == "numeric" and stats:
            q1, q3 = good.quantile([0.25, 0.75])
            iqr = q3 - q1
            outlier_count = int(((good < q1 - 1.5 * iqr) | (good > q3 + 1.5 * iqr)).sum())
            columns[-1]["outliers"] = outlier_count
            stats.update({"q1": float(q1), "q3": float(q3)})
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
    numeric_frame = pd.DataFrame(numeric)
    correlations = []
    if len(numeric_frame.columns) >= 2:
        matrix = numeric_frame.corr(min_periods=3)
        for left_index, left in enumerate(matrix.columns):
            for right in matrix.columns[left_index + 1 :]:
                coefficient = matrix.loc[left, right]
                if pd.notna(coefficient):
                    correlations.append({"left": left, "right": right, "coefficient": round(float(coefficient), 4)})
        correlations.sort(key=lambda item: abs(item["coefficient"]), reverse=True)
    outliers = sum(column["outliers"] for column in columns)
    embedded_delimiters = []
    for header in headers:
        values = normalized[header].dropna().astype(str)
        pipe_ratio = float(values.str.count(r"\|").ge(2).mean()) if len(values) else 0
        if header.count("|") >= 2 or pipe_ratio >= 0.8:
            embedded_delimiters.append(header)
    executive = _executive_summary(
        scores=scores,
        missing=missing,
        duplicates=duplicates,
        rows=n,
        mismatches=mismatches,
        invalid=invalid,
        header_detected=use_header or column_names is not None,
        outliers=outliers,
        correlations=correlations,
        embedded_delimiters=embedded_delimiters,
    )
    numeric_names = list(numeric)
    scatter = []
    if len(numeric_names) >= 2:
        scatter_axes = [correlations[0]["left"], correlations[0]["right"]] if correlations else numeric_names[:2]
        pairs = pd.DataFrame({"x": numeric[scatter_axes[0]], "y": numeric[scatter_axes[1]]}).dropna()
        scatter = pairs.head(500).to_dict("records")
    else:
        scatter_axes = numeric_names[:2]
    return {
        "filename": filename,
        "rows": n,
        "column_count": len(headers),
        "missing": missing,
        "duplicates": duplicates,
        "scores": {k: round(v, 2) if v is not None else None for k, v in scores.items()},
        "header": {
            "mode": header_mode,
            "detected": detected_header,
            "used": use_header,
            "generated_names": not use_header and column_names is None,
            "configured_names": column_names is not None,
        },
        "executive": executive,
        "columns": columns,
        "preview": normalized.head(100).where(normalized.head(100).notna(), None).to_dict("records"),
        "scatter": scatter,
        "scatter_axes": scatter_axes,
        "correlations": correlations[:10],
        "provenance": {
            "source": "uploaded_file",
            "sha256": hashlib.sha256(content).hexdigest(),
            "input_bytes": len(content),
            "file_rows": len(all_rows),
            "analyzed_rows": n,
            "preview_rows": min(n, 100),
            "method_version": "0.5.2",
            "calculation_mode": "deterministic",
            "data_values_generated": False,
        },
    }
