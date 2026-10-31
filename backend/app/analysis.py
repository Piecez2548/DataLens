"""Deterministic CSV profiling. All scores describe inferred rules, not truth."""

import codecs
import csv
import datetime
import hashlib
import io
import re
import unicodedata
import zipfile
from collections import Counter

import numpy as np
import openpyxl
import pandas as pd

MAX_BYTES = 10 * 1024 * 1024
MAX_ROWS = 100_000
MAX_COLUMNS = 100
MAX_XLSX_UNCOMPRESSED = 50 * 1024 * 1024
MAX_MISSING_MARKERS = 20
ALLOWED_TYPES = {"numeric", "categorical", "datetime", "boolean", "email", "identifier"}
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


DATE_YMD = re.compile(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?")
DATE_DMY = re.compile(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?")


def _date_parts(value: str) -> tuple[int, int, int] | None:
    """Return (year, month, day) for a date-shaped value; day-first for D/M/YYYY. None when not date-shaped."""
    if match := DATE_YMD.fullmatch(value):
        return int(match[1]), int(match[2]), int(match[3])
    if match := DATE_DMY.fullmatch(value):
        return int(match[3]), int(match[2]), int(match[1])
    return None


def _to_date(value: str) -> datetime.date | None:
    """Calendar date for a date-shaped value; Buddhist Era years (2400+) are converted by subtracting 543."""
    parts = _date_parts(value)
    if parts is None:
        return None
    year, month, day = parts
    if year >= 2400:
        year -= 543
    try:
        return datetime.date(year, month, day)
    except ValueError:
        return None


def _is_valid_date(value: str) -> bool:
    return _to_date(value) is not None


THAI_ID_PATTERN = re.compile(r"\d{13}")
THAI_PHONE_PATTERN = re.compile(r"0[2-9]\d{7,8}")
THAI_ID_NAME_HINTS = ("national_id", "citizen", "id_card", "idcard", "thai_id", "เลขบัตร", "บัตรประชาชน")


def _thai_id_valid(value: str) -> bool:
    """Thai national ID check digit: (11 - sum(d_i * (13 - i)) mod 11) mod 10."""
    if not THAI_ID_PATTERN.fullmatch(value) or value[0] == "0":
        return False
    total = sum(int(digit) * (13 - index) for index, digit in enumerate(value[:12]))
    return (11 - total % 11) % 10 == int(value[12])


def _detect_personal_pattern(name: str, values: pd.Series) -> str | None:
    """Flag columns that look like Thai national IDs or phone numbers (personal data)."""
    if not len(values):
        return None
    lowered = name.lower()
    compact = values.str.replace(r"[\s-]", "", regex=True)
    id_shaped = compact.map(lambda value: bool(THAI_ID_PATTERN.fullmatch(value)))
    if id_shaped.mean() >= 0.8:
        valid_share = compact[id_shaped].map(_thai_id_valid).mean()
        if valid_share >= 0.5 or any(hint in lowered for hint in THAI_ID_NAME_HINTS):
            return "thai_national_id"
    if compact.map(lambda value: bool(THAI_PHONE_PATTERN.fullmatch(value))).mean() >= 0.8:
        return "thai_phone"
    return None


def _timeseries(column: str, values: pd.Series) -> dict | None:
    """Row counts per day, month or year for one date column, with empty periods counted as gaps."""
    parsed = [parsed_date for parsed_date in (_to_date(value) for value in values) if parsed_date]
    if not parsed:
        return None
    first, last = min(parsed), max(parsed)
    span = (last - first).days
    if span <= 92:
        granularity, key = "day", lambda d: d.isoformat()
        labels = [(first + datetime.timedelta(days=offset)).isoformat() for offset in range(span + 1)]
    elif span <= 3650:
        granularity, key = "month", lambda d: f"{d.year:04d}-{d.month:02d}"
        labels = []
        year, month = first.year, first.month
        while (year, month) <= (last.year, last.month):
            labels.append(f"{year:04d}-{month:02d}")
            year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    else:
        granularity, key = "year", lambda d: f"{d.year:04d}"
        labels = [f"{year:04d}" for year in range(first.year, last.year + 1)]
    counts = Counter(key(d) for d in parsed)
    points = [{"label": label, "count": counts.get(label, 0)} for label in labels]
    return {
        "column": column,
        "granularity": granularity,
        "first": first.isoformat(),
        "last": last.isoformat(),
        "gaps": sum(point["count"] == 0 for point in points),
        "points": points,
    }


def _xlsx_to_csv_text(content: bytes) -> tuple[str, str]:
    """Read cached values of the first worksheet. Formulas, macros and external links are never evaluated."""
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            if sum(info.file_size for info in archive.infolist()) > MAX_XLSX_UNCOMPRESSED:
                raise ValueError("The workbook is too large after decompression.")
        workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except (zipfile.BadZipFile, KeyError, OSError) as exc:
        raise ValueError("The Excel workbook could not be read.") from exc
    except ValueError:
        raise
    except Exception as exc:  # openpyxl raises several unrelated types for corrupt workbooks
        raise ValueError("The Excel workbook could not be read.") from exc
    try:
        sheet = workbook.worksheets[0]
        rows = []
        for row in sheet.iter_rows(values_only=True):
            cells = [_xlsx_cell(cell) for cell in row]
            while cells and cells[-1] == "":
                cells.pop()
            rows.append(cells)
            if len(rows) > MAX_ROWS + 2:
                raise ValueError("Maximum 100,000 rows supported.")
        while rows and not rows[-1]:
            rows.pop()
        width = max((len(row) for row in rows), default=0)
        if not width:
            raise ValueError("The first worksheet is empty.")
        if width > MAX_COLUMNS:
            raise ValueError("Maximum 100 columns supported.")
        buffer = io.StringIO()
        writer = csv.writer(buffer, lineterminator="\n")
        for row in rows:
            writer.writerow(row + [""] * (width - len(row)))
        return buffer.getvalue(), sheet.title
    finally:
        workbook.close()


def _xlsx_cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, datetime.datetime):
        return value.date().isoformat() if value.time() == datetime.time() else value.isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


DELIMITERS = {",": "comma", ";": "semicolon", "	": "tab", "|": "pipe"}


def _decode(content: bytes) -> tuple[str, str]:
    """Decode deterministically: BOM, then UTF-8, then Thai Windows-874 (common for Excel exports)."""
    if content.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        try:
            return content.decode("utf-16"), "utf-16"
        except UnicodeDecodeError as exc:
            raise ValueError("The UTF-16 file could not be decoded.") from exc
    try:
        return content.decode("utf-8-sig"), "utf-8"
    except UnicodeDecodeError:
        pass
    try:
        return content.decode("cp874"), "cp874"
    except UnicodeDecodeError as exc:
        raise ValueError("Use a UTF-8, UTF-16 or Thai Windows-874 encoded CSV file.") from exc


def _detect_delimiter(text: str) -> str:
    """Pick the delimiter that splits the first rows into the same number (>1) of fields; comma wins ties."""
    best, best_score = ",", 0
    for candidate in DELIMITERS:
        sample = []
        for row in csv.reader(io.StringIO(text), delimiter=candidate):
            sample.append(len(row))
            if len(sample) == 20:
                break
        if sample and sample[0] > 1 and len(set(sample)) == 1 and sample[0] > best_score:
            best, best_score = candidate, sample[0]
    return best


def _detect_header(text: str, delimiter: str = ",") -> bool:
    """Treat row one as a header only when its contents provide clear evidence."""
    rows = csv.reader(io.StringIO(text), delimiter=delimiter)
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
    label_shaped = all(
        cell
        and (cell[0].isalpha() or cell[0] == "_")
        and all(char.isalnum() or char in "_-" or unicodedata.category(char).startswith("M") for char in cell)
        for cell in normalized
    )
    visibly_header_shaped = label_shaped and all(cell.strip() == cell.strip().lower() for cell in first)
    data_shaped_second_row = any(
        re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?", cell.strip())
        or _date_parts(cell.strip()) is not None
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
    personal_data: list[str],
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
    if personal_data:
        issues.append(
            {
                "severity": "high",
                "title": "Possible personal data detected",
                "detail": f"Thai national ID or phone number patterns were found in: {', '.join(personal_data[:3])}.",
                "recommendation": "Remove or mask these columns, or confirm a lawful basis and approved handling before sharing.",
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
    missing_markers: list[str] | None = None,
) -> dict:
    if len(content) > MAX_BYTES:
        raise ValueError("CSV exceeds the 10 MB limit.")
    sheet_name = None
    if content.startswith(b"PK\x03\x04"):
        text, sheet_name = _xlsx_to_csv_text(content)
        encoding, delimiter, source_format = "xlsx", ",", "xlsx"
    else:
        text, encoding = _decode(content)
        if "\x00" in text:
            raise ValueError("The file contains binary data.")
        delimiter = _detect_delimiter(text)
        source_format = "csv"
    markers = missing_markers or []
    if (
        not isinstance(markers, list)
        or len(markers) > MAX_MISSING_MARKERS
        or not all(isinstance(item, str) and 0 < len(item.strip()) <= 30 for item in markers)
    ):
        raise ValueError("Missing markers must be a list of at most 20 short text values.")
    marker_set = {item.strip().lower() for item in markers}
    if header_mode not in {"auto", "present", "absent"}:
        raise ValueError("header_mode must be auto, present, or absent.")
    try:
        reader = csv.reader(io.StringIO(text), delimiter=delimiter, strict=True)
        all_rows = list(reader)
        if not all_rows:
            raise ValueError("The CSV is empty or malformed.")
        width = len(all_rows[0])
        if width > MAX_COLUMNS:
            raise ValueError("Maximum 100 columns supported.")
        uneven = [(index + 1, len(row)) for index, row in enumerate(all_rows) if len(row) != width]
        if uneven:
            examples = ", ".join(f"row {number} has {count}" for number, count in uneven[:5])
            more = f" (+{len(uneven) - 5} more)" if len(uneven) > 5 else ""
            raise ValueError(
                f"Every row must have the same number of fields: expected {width}, but {examples}{more}."
            )
        detected_header = _detect_header(text, delimiter)
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
    if marker_set:
        normalized = normalized.apply(lambda col: col.where(~col.str.lower().isin(marker_set), None))
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
    columns, numeric, personal_data = [], {}, []
    mismatches = invalid = checked = 0
    for name in headers:
        values = normalized[name].dropna()

        def kind(value):
            if value.lower() in {"true", "false"}:
                return "boolean"
            if re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[+-]?(?:inf(?:inity)?|nan)", value, re.IGNORECASE):
                return "numeric"
            if _date_parts(value) is not None:
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
        pattern = _detect_personal_pattern(name, values)
        if pattern and name not in type_overrides:
            inferred = "identifier"
        if pattern:
            personal_data.append(name)
        dtype = type_overrides.get(name, inferred)
        if dtype == "email" or dtype == "identifier":
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
            bad = int((~matched.map(_is_valid_date)).sum())
        elif dtype == "email":
            bad = int((~matched.map(lambda value: bool(EMAIL_PATTERN.fullmatch(value)))).sum())
        elif pattern == "thai_national_id":
            bad = int((~matched.str.replace(r"[\s-]", "", regex=True).map(_thai_id_valid)).sum())
        if dtype in {"numeric", "datetime", "boolean", "email"} or pattern == "thai_national_id":
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
                "pattern": pattern,
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
        raise TypeError("Business rules must be an object keyed by column name.")
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
        personal_data=personal_data,
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
        "timeseries": next(
            (
                series
                for column in columns
                if column["type"] == "datetime"
                and (series := _timeseries(column["name"], normalized[column["name"]].dropna()))
            ),
            None,
        ),
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
            "source_format": source_format,
            "sheet": sheet_name,
            "encoding": encoding,
            "delimiter": DELIMITERS[delimiter] if source_format == "csv" else None,
            "missing_markers": sorted(marker_set),
            "calculation_mode": "deterministic",
            "data_values_generated": False,
        },
    }
