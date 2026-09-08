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
    """Treat row one as a header only when its contents provide clear evidence."""
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
    visibly_header_shaped = label_shaped and all(cell.strip() == cell.strip().lower() for cell in first)
    data_shaped_second_row = any(
        re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?", cell.strip())
        or re.fullmatch(r"\d{4}-\d{2}-\d{2}", cell.strip())
        for cell in second
    )
    return bool(
        any(cell in common_labels for cell in normalized)
        or (visibly_header_shaped and (data_shaped_second_row or not second or all(not cell.strip() for cell in second)))
    )


def _executive_summary(
    *,
    scores: dict,
    missing: int,
    duplicates: int,
    rows: int,
    columns: int,
    mismatches: int,
    invalid: int,
    header_detected: bool,
    outliers: int,
    correlations: list[dict],
    embedded_delimiters: list[str],
    business_rule_violations: int,
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
        ratio = missing / max(1, rows * columns)
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
    if business_rule_violations:
        issues.append(
            {
                "severity": "high",
                "title": f"{business_rule_violations:,} business-rule violations require action",
                "detail": "Uploaded values fall outside rules explicitly configured for this analysis.",
                "recommendation": "Resolve each violation or document an approved exception before executive use.",
            }
        )
    high = sum(item["severity"] == "high" for item in issues)
    if high:
        status, message = "Action required", "Resolve high-impact data risks before executive reporting."
    elif issues:
        status, message = "Review needed", "The dataset is usable for exploration after the listed checks."
    else:
        status, message = "Ready for exploration", "No structural issues were found by the supported checks."
    severity_order = {"high": 0, "medium": 1, "info": 2}
    issues.sort(key=lambda issue: severity_order[issue["severity"]])
    return {
        "status": status,
        "message": message,
        "quality_score": round(scores["Overall"], 2),
        "issue_count": len(issues),
        "high_priority_count": high,
        "issues": issues,
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
    business_rules: dict[str, dict] | None = None,
) -> dict:
    if len(content) > MAX_BYTES:
        raise ValueError("CSV exceeds the 10 MB limit.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("Use a UTF-8 encoded CSV file.") from exc
    if "\x00" in text:
        raise ValueError("The file contains binary data.")
    first_physical_line = text.splitlines()[0] if text.splitlines() else ""
    if "," not in first_physical_line and (";" in first_physical_line or "\t" in first_physical_line):
        raise ValueError("This file appears to use a semicolon or tab delimiter. Export it as comma-separated CSV.")
    if header_mode not in {"auto", "present", "absent"}:
        raise ValueError("header_mode must be auto, present, or absent.")
    try:
        reader = csv.reader(io.StringIO(text), strict=True)
        all_rows = list(reader)
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
        inferred = dominant if counts and counts[dominant] / len(values) > 0.5 else "categorical"
        normalized_name = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
        email_hits = int(values.map(lambda value: bool(EMAIL_PATTERN.fullmatch(value))).sum())
        if values.size and ("email" in normalized_name or email_hits / len(values) >= 0.8):
            inferred = "email"
        if normalized_name in {"id", "customer_id", "record_id", "user_id"} or normalized_name.endswith("_id"):
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
    if business_rules is None:
        business_rules = {}
    if not isinstance(business_rules, dict):
        raise ValueError("Business rules must be an object keyed by column name.")
    rule_results = []
    for name, rule in business_rules.items():
        if name not in headers or not isinstance(rule, dict):
            raise ValueError("Each business rule must target an existing column.")
        if set(rule) - {"required", "allowed_values", "min", "max"}:
            raise ValueError("A business rule contains an unsupported condition.")
        if "required" in rule and not isinstance(rule["required"], bool):
            raise ValueError("required business rules must be boolean values.")
        values = normalized[name]
        nonempty = values.dropna().astype(str)
        if rule.get("required") is True:
            rule_results.append({"column": name, "rule": "required", "checked": n, "violations": int(values.isna().sum())})
        if "allowed_values" in rule:
            allowed = rule["allowed_values"]
            if not isinstance(allowed, list) or len(allowed) > 100 or not all(isinstance(item, str) for item in allowed):
                raise ValueError("allowed_values must be a list of at most 100 text values.")
            allowed_set = set(allowed)
            rule_results.append(
                {
                    "column": name,
                    "rule": "allowed_values",
                    "checked": len(nonempty),
                    "violations": int((~nonempty.isin(allowed_set)).sum()),
                }
            )
        numeric_values = pd.to_numeric(nonempty, errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()
        if "min" in rule and "max" in rule:
            minimum, maximum = rule["min"], rule["max"]
            if (
                isinstance(minimum, bool)
                or isinstance(maximum, bool)
                or not isinstance(minimum, (int, float))
                or not isinstance(maximum, (int, float))
                or not np.isfinite(minimum)
                or not np.isfinite(maximum)
                or minimum > maximum
            ):
                raise ValueError("Business rule minimum must be a finite number no greater than maximum.")
        for key, operator in (("min", "below_min"), ("max", "above_max")):
            if key not in rule:
                continue
            column_type = next(column["type"] for column in columns if column["name"] == name)
            if column_type != "numeric":
                raise ValueError(f"{key} business rules require a numeric column.")
            threshold = rule[key]
            if isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or not np.isfinite(threshold):
                raise ValueError(f"{key} business rules must be finite numbers.")
            violations = (numeric_values < threshold).sum() if key == "min" else (numeric_values > threshold).sum()
            rule_results.append(
                {"column": name, "rule": operator, "threshold": float(threshold), "checked": len(numeric_values), "violations": int(violations)}
            )
    business_rule_violations = sum(item["violations"] for item in rule_results)
    executive = _executive_summary(
        scores=scores,
        missing=missing,
        duplicates=duplicates,
        rows=n,
        columns=len(headers),
        mismatches=mismatches,
        invalid=invalid,
        header_detected=use_header or column_names is not None,
        outliers=outliers,
        correlations=correlations,
        embedded_delimiters=embedded_delimiters,
        business_rule_violations=business_rule_violations,
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
        "business_rules": {
            "configured": bool(rule_results),
            "passed": business_rule_violations == 0,
            "total_violations": business_rule_violations,
            "results": rule_results,
        },
        "provenance": {
            "source": "uploaded_file",
            "sha256": hashlib.sha256(content).hexdigest(),
            "input_bytes": len(content),
            "file_rows": len(all_rows),
            "analyzed_rows": n,
            "preview_rows": min(n, 100),
            "method_version": "0.7.1",
            "calculation_mode": "deterministic",
            "data_values_generated": False,
        },
    }
