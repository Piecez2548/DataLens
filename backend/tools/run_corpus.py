import sys
from collections import Counter

from app.analysis import analyze
from tests.corpus import build, to_csv_bytes, to_json_bytes, to_xlsx_bytes

problems = Counter()
details = []
N = int(sys.argv[1]) if len(sys.argv) > 1 else 100


def check(label, ok, seed, info=""):
    if not ok:
        problems[label] += 1
        if len(details) < 40:
            details.append((label, seed, info))


for seed in range(N):
    for defects in (False, True):
        fmt = ["csv", "csv;", "csv-tab", "utf16", "xlsx", "json"][seed % 6]
        header, rows, truth, meta = build(seed, defects, record_numbers=fmt == "json")
        if fmt == "csv":
            data, name = to_csv_bytes(header, rows, ",", "utf-8-sig"), "f.csv"
        elif fmt == "csv;":
            data, name = to_csv_bytes(header, rows, ";"), "f.csv"
        elif fmt == "csv-tab":
            data, name = to_csv_bytes(header, rows, "\t"), "f.csv"
        elif fmt == "utf16":
            data, name = to_csv_bytes(header, rows, ",", "utf-16"), "f.csv"
        elif fmt == "xlsx":
            data, name = to_xlsx_bytes(header, rows), "f.xlsx"
        else:
            data, name = to_json_bytes(header, rows), "f.json"
        try:
            r = analyze(data, name)
        except Exception as exc:  # noqa: BLE001
            check("crash", False, (seed, defects, fmt), repr(exc)[:150])
            continue
        tag = (seed, defects, fmt)
        check("rows", r["rows"] == truth.rows, tag, f"{r['rows']} vs {truth.rows}")
        check("columns", r["column_count"] == truth.columns, tag)
        kinds = r["issue_samples"]["kinds"]
        total = lambda k: kinds.get(k, {}).get("total", 0)
        titles = " | ".join(i["title"] for i in r["executive"]["issues"])
        if truth.clean:
            check("clean-not-ready", r["executive"]["status"] == "Ready for exploration", tag, titles)
            continue
        check("missing", total("missing") == truth.missing, tag, f"{total('missing')} vs {truth.missing}")
        check("duplicates", r["duplicates"] == truth.duplicates, tag, f"{r['duplicates']} vs {truth.duplicates}")
        check("mismatch", total("mismatch") == truth.mismatches, tag, f"{total('mismatch')} vs {truth.mismatches}")
        check("invalid-dates", total("invalid") >= truth.invalid_dates, tag, f"{total('invalid')} vs {truth.invalid_dates}")
        check("outliers", total("outlier") >= truth.outliers_at_least, tag, f"{total('outlier')} vs {truth.outliers_at_least}")
        check("variants", total("variant") >= truth.variant_rows, tag, f"{total('variant')} vs {truth.variant_rows}")
        check("negative-warning", "negative values in amount" in titles, tag, titles)
        located = {e["row"] for e in kinds.get("missing", {}).get("examples", [])}
        check("missing-rows", truth.missing_rows <= located, tag, f"{sorted(truth.missing_rows - located)}")
        located = {e["row"] for e in kinds.get("mismatch", {}).get("examples", [])}
        check("mismatch-rows", truth.mismatch_rows <= located, tag, f"{sorted(truth.mismatch_rows - located)}")
        located = {e["row"] for e in kinds.get("duplicate", {}).get("examples", [])}
        check("duplicate-rows", truth.duplicate_rows <= located, tag, f"{sorted(truth.duplicate_rows - located)} {sorted(located)[:5]}")
        located = {e["row"] for e in kinds.get("invalid", {}).get("examples", [])}
        check("invalid-rows", truth.invalid_rows <= located, tag, f"{sorted(truth.invalid_rows - located)}")
        check("not-flagged", r["executive"]["status"] != "Ready for exploration", tag)
print("files:", N * 2, "problems:", dict(problems))
for d in details:
    print(d)
