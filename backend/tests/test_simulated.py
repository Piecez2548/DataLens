"""Simulated files with known, injected defects. Every injected problem must be found, at the right row, and clean files must pass.

`python -m tools.run_corpus 300`, `python -m tools.wild_stats` and `python -m tools.fuzz 1500` run the same checks on a larger scale.
"""

import random

import numpy as np
import pandas as pd
import pytest

from app.analysis import analyze
from tests.corpus import build, to_csv_bytes, to_json_bytes, to_xlsx_bytes

FORMATS = ["csv", "csv;", "csv-tab", "utf16", "xlsx", "json"]


def render(seed: int, defects: bool):
    fmt = FORMATS[seed % len(FORMATS)]
    header, rows, truth, _ = build(seed, defects, record_numbers=fmt == "json")
    if fmt == "csv":
        return to_csv_bytes(header, rows, ",", "utf-8-sig"), "f.csv", truth
    if fmt == "csv;":
        return to_csv_bytes(header, rows, ";"), "f.csv", truth
    if fmt == "csv-tab":
        return to_csv_bytes(header, rows, "\t"), "f.csv", truth
    if fmt == "utf16":
        return to_csv_bytes(header, rows, ",", "utf-16"), "f.csv", truth
    if fmt == "xlsx":
        return to_xlsx_bytes(header, rows), "f.xlsx", truth
    return to_json_bytes(header, rows), "f.json", truth


@pytest.mark.parametrize("seed", range(24))
def test_clean_files_are_ready_to_send(seed):
    data, name, truth = render(seed, defects=False)
    result = analyze(data, name)
    assert result["rows"] == truth.rows
    assert result["executive"]["status"] == "Ready for exploration", [i["title"] for i in result["executive"]["issues"]]


@pytest.mark.parametrize("seed", range(36))
def test_every_injected_defect_is_found_at_the_right_row(seed):
    data, name, truth = render(seed, defects=True)
    result = analyze(data, name)
    kinds = result["issue_samples"]["kinds"]

    def total(kind):
        return kinds.get(kind, {}).get("total", 0)

    def rows(kind):
        return {item["row"] for item in kinds.get(kind, {}).get("examples", [])}

    assert result["rows"] == truth.rows
    assert total("missing") == truth.missing
    assert result["duplicates"] == truth.duplicates
    assert total("mismatch") == truth.mismatches
    assert total("invalid") >= truth.invalid_dates
    assert total("outlier") >= truth.outliers_at_least
    assert total("variant") >= truth.variant_rows
    assert truth.missing_rows <= rows("missing")
    assert truth.mismatch_rows <= rows("mismatch")
    assert truth.duplicate_rows <= rows("duplicate")
    assert truth.invalid_rows <= rows("invalid")
    titles = " | ".join(item["title"] for item in result["executive"]["issues"])
    assert "negative values in amount" in titles
    assert result["executive"]["status"] != "Ready for exploration"


@pytest.mark.parametrize("seed", range(12))
def test_numbers_and_summaries_match_an_independent_calculation(seed):
    rng = random.Random(seed)
    n = rng.randint(30, 600)
    frame = pd.DataFrame(
        {
            "k": [f"K{rng.randint(1, max(3, n // 3))}" for _ in range(n)],
            "team": [rng.choice(["a", "b", "c", "d"]) for _ in range(n)],
            "amt": [round(rng.uniform(-50, 5000), 2) for _ in range(n)],
            "qty": [rng.randint(0, 40) for _ in range(n)],
        }
    ).astype(object)
    for column in ("team", "amt"):
        for i in rng.sample(range(n), rng.randint(0, 6)):
            frame.loc[i, column] = ""
    text = frame.to_csv(index=False)
    result = analyze(text.encode(), "s.csv", business_key=["k"], group_by={"by": "team", "measure": "qty"})
    reference = frame.replace("", np.nan)
    amt = pd.to_numeric(reference["amt"]).dropna()
    column = next(c for c in result["columns"] if c["name"] == "amt")
    q1, q3 = np.percentile(amt, [25, 75])
    spread = q3 - q1
    assert result["missing"] == int(reference.isna().sum().sum())
    assert result["duplicates"] == int(frame.duplicated().sum())
    assert abs(column["stats"]["mean"] - amt.mean()) < 1e-6
    assert abs(column["stats"]["std"] - amt.std(ddof=0)) < 1e-6
    assert column["outliers"] == int(((amt < q1 - 1.5 * spread) | (amt > q3 + 1.5 * spread)).sum())
    if result["key_duplicates"]:
        assert result["key_duplicates"]["duplicate_rows"] == int(frame.duplicated(subset=["k"]).sum())
    groups = {row["group"]: row for row in result["group_summary"]["rows"]}
    for team, part in reference.dropna(subset=["team"]).groupby("team"):
        assert groups[team]["rows"] == len(part)
        assert abs(groups[team]["sum"] - part["qty"].astype(float).sum()) < 1e-6
    for score in result["scores"].values():
        assert score is None or 0 <= score <= 100


@pytest.mark.parametrize("seed", range(10))
def test_row_numbers_survive_title_lines_and_blank_lines(seed):
    rng = random.Random(seed)
    n = rng.randint(10, 80)
    blank_at = set(rng.sample(range(1, n), 3))
    missing_at = set(rng.sample([i for i in range(n) if i not in blank_at], 3))
    lines = ["Report title", "Prepared by X", "id,grp,val"]
    expected = set()
    for i in range(n):
        if i in blank_at:
            lines.append("")
        group = "" if i in missing_at else rng.choice(["x", "y"])
        lines.append(f"{i},{group},{rng.randint(1, 9)}")
        if i in missing_at:
            expected.add(len(lines))
    result = analyze(("\n".join(lines) + "\n").encode(), "t.csv", header_row=3)
    located = {item["row"] for item in result["issue_samples"]["kinds"]["missing"]["examples"]}
    assert result["rows"] == n
    assert located == expected


@pytest.mark.parametrize("seed", range(120))
def test_damaged_files_fail_cleanly_or_analyze_sanely(seed):
    rng = random.Random(seed)
    header, rows, _, _ = build(seed, bool(seed % 2))
    rows = rows[:120]
    kind = rng.choice(["csv", "xlsx", "json"])
    data = {"csv": to_csv_bytes, "xlsx": lambda h, r: to_xlsx_bytes(h, r), "json": lambda h, r: to_json_bytes(h, r)}[kind](header, rows)
    name = {"csv": "f.csv", "xlsx": "f.xlsx", "json": "f.json"}[kind]
    damaged = bytearray(data)
    how = rng.choice(["flip", "truncate", "insert", "quotes"])
    if how == "flip":
        for _ in range(rng.randint(1, 20)):
            damaged[rng.randrange(len(damaged))] = rng.randrange(256)
    elif how == "truncate":
        damaged = damaged[: rng.randrange(1, len(damaged))]
    elif how == "insert":
        at = rng.randrange(len(damaged))
        damaged[at:at] = bytes(rng.randrange(256) for _ in range(rng.randint(1, 30)))
    else:
        for _ in range(rng.randint(1, 10)):
            damaged[rng.randrange(len(damaged)) : 0] = b'"'
    try:
        result = analyze(bytes(damaged), name)
    except ValueError:
        return  # a clear refusal is fine; any other exception type would be an HTTP 500
    assert len(result["columns"]) == result["column_count"] >= 1
    assert result["problem_rows"]["listed"] <= result["problem_rows"]["total"]
    assert all(item["row"] > 0 for entry in result["issue_samples"]["kinds"].values() for item in entry["examples"])


def test_personal_data_detection_has_few_false_alarms():
    rng = random.Random(7)

    def thai_id():
        digits = [rng.randint(1, 8)] + [rng.randint(0, 9) for _ in range(11)]
        total = sum(d * (13 - i) for i, d in enumerate(digits))
        return "".join(map(str, digits)) + str((11 - total % 11) % 10)

    def pattern(header, values):
        text = f"{header},amt\n" + "\n".join(f"{v},{i}" for i, v in enumerate(values)) + "\n"
        return analyze(text.encode(), "p.csv")["columns"][0]["pattern"]

    assert pattern("pid", [thai_id() for _ in range(50)]) == "thai_national_id"
    assert pattern("ref", [str(rng.randint(10**12, 10**13 - 1)) for _ in range(200)]) is None  # order numbers
    assert pattern("sku", [f"0{rng.randint(2, 9)}{rng.randint(10**6, 10**7 - 1)}" for _ in range(100)]) is None  # 9-digit codes
    assert pattern("contact", [f"08{rng.randint(10**7, 10**8 - 1)}" for _ in range(60)]) == "thai_phone"
    assert pattern("contact", [f"08{rng.randint(1, 9)}-{rng.randint(100, 999)}-{rng.randint(1000, 9999)}" for _ in range(60)]) == "thai_phone"
    assert pattern("contact", [f"+668{rng.randint(10**7, 10**8 - 1)}" for _ in range(60)]) == "thai_phone"
    assert pattern("tel", [f"02{rng.randint(10**6, 10**7 - 1)}" for _ in range(60)]) == "thai_phone"  # landline with a telling name


def test_email_columns_are_reported_as_personal_data():
    result = analyze(b"id,email\n1,a@b.com\n2,c@d.org\n3,e@f.net\n", "e.csv")
    assert any("Email addresses found" in item["title"] for item in result["executive"]["issues"])
