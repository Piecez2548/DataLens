"""Simulated files with known, injected defects, used to measure what the analyzer finds and what it misses."""

import csv
import datetime
import io
import json
import random
from dataclasses import dataclass, field

import openpyxl

CITIES = ["Bangkok", "Chiang Mai", "Phuket", "Khon Kaen", "Hat Yai", "Nakhon Ratchasima", "Udon Thani", "Rayong"]
THAI_NAMES = ["สมชาย ใจดี", "สมหญิง รักเรียน", "วิชัย มั่นคง", "มานี มีตา", "ปิติ ชูใจ", "นภา สุขสันต์", "ธนากร พงษ์ไทย"]
TEAMS = ["North", "South", "East", "West", "Central"]


@dataclass
class Expected:
    rows: int
    columns: int
    missing: int = 0
    duplicates: int = 0
    mismatches: int = 0
    invalid_dates: int = 0
    outliers_at_least: int = 0
    negative_amounts: int = 0
    future_dates: int = 0
    variant_rows: int = 0
    key_duplicates: int = 0
    personal: bool = False
    missing_rows: set = field(default_factory=set)  # file row numbers (header = row 1)
    mismatch_rows: set = field(default_factory=set)
    duplicate_rows: set = field(default_factory=set)
    invalid_rows: set = field(default_factory=set)
    clean: bool = False


def _date_text(day: datetime.date, style: str) -> str:
    if style == "iso":
        return day.isoformat()
    if style == "dmy":
        return f"{day.day}/{day.month}/{day.year}"
    if style == "be":
        return f"{day.day}/{day.month}/{day.year + 543}"
    return f"{day.day} {day.strftime('%b')} {day.year}"


def build(seed: int, defects: bool, record_numbers: bool = False) -> tuple[list[str], list[list[str]], Expected, dict]:
    """Return header, rows and the truth about what was injected. Defects are placed only in dedicated columns."""
    rng = random.Random(seed)
    n = rng.randint(40, 1500)
    date_style = rng.choice(["iso", "dmy", "be", "named"])
    start = datetime.date(2023, 1, 1)
    header = ["order_id", "customer", "city", "team", "order_date", "amount", "qty", "channel"]
    rows = []
    for i in range(n):
        day = start + datetime.timedelta(days=rng.randint(0, 400))
        if date_style == "dmy" or date_style == "be":
            day = day.replace(day=rng.randint(13, 28))  # day above 12 proves day-first
        rows.append(
            [
                str(1000 + i),
                rng.choice(THAI_NAMES),
                rng.choice(CITIES),
                rng.choice(TEAMS),
                _date_text(day, date_style),
                f"{rng.uniform(50, 500):.2f}",
                str(rng.randint(1, 20)),
                rng.choice(["web", "store", "phone-in", "app"]),
            ]
        )
    truth = Expected(rows=n, columns=len(header), clean=not defects)
    meta = {"date_style": date_style}
    if not defects:
        return header, rows, truth, meta
    used: set[int] = set()

    def pick(count: int) -> list[int]:
        choices = [i for i in rng.sample(range(n), min(n, count * 3)) if i not in used][:count]
        used.update(choices)
        return choices

    for i in pick(rng.randint(1, 6)):  # blanks in customer / team
        rows[i][rng.choice([1, 3])] = ""
        truth.missing += 1
        truth.missing_rows.add(i + 2)
    for i in pick(rng.randint(1, 4)):  # text in a numeric column
        rows[i][5] = rng.choice(["N/A?", "see note", "abc"])
        truth.mismatches += 1
        truth.mismatch_rows.add(i + 2)
    for i in pick(rng.randint(1, 3)):  # impossible calendar dates
        rows[i][4] = "31/02/2024" if date_style in {"dmy", "be", "named", "iso"} else rows[i][4]
        truth.invalid_dates += 1
        truth.invalid_rows.add(i + 2)
    for i in pick(rng.randint(1, 3)):  # extreme outliers
        rows[i][6] = str(rng.randint(5000, 9000))
        truth.outliers_at_least += 1
    for i in pick(rng.randint(1, 3)):  # negative amounts
        rows[i][5] = f"-{rng.uniform(5, 40):.2f}"
        truth.negative_amounts += 1
    for i in pick(rng.randint(1, 3)):  # spelling variants of a city
        rows[i][2] = rng.choice([rows[i][2].lower(), rows[i][2].upper()])
        truth.variant_rows += 1
    for _ in range(rng.randint(1, 4)):  # whole-row duplicates (copies of untouched rows)
        source = rng.choice([i for i in range(n) if i not in used])
        rows.append(list(rows[source]))
        truth.duplicates += 1
        truth.duplicate_rows.add(len(rows) + 1)
    truth.rows = len(rows)
    if record_numbers:  # JSON has no header line, so records are numbered from 1
        for name in ("missing_rows", "mismatch_rows", "duplicate_rows", "invalid_rows"):
            setattr(truth, name, {value - 1 for value in getattr(truth, name)})
    return header, rows, truth, meta


def to_csv_bytes(header, rows, delimiter=",", encoding="utf-8") -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=delimiter, lineterminator="\r\n")
    writer.writerow(header)
    writer.writerows(rows)
    text = buffer.getvalue()
    if encoding == "utf-8-sig":
        return text.encode("utf-8-sig")
    if encoding == "utf-16":
        return text.encode("utf-16")
    return text.encode(encoding)


def to_xlsx_bytes(header, rows) -> bytes:
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(header)
    for row in rows:
        sheet.append([int(v) if v.isdigit() else v for v in row])
    out = io.BytesIO()
    workbook.save(out)
    return out.getvalue()


def to_json_bytes(header, rows) -> bytes:
    return json.dumps([dict(zip(header, row, strict=True)) for row in rows], ensure_ascii=False).encode("utf-8")
