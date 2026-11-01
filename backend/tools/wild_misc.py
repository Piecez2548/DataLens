import datetime
import io
import json
import random
import statistics

import openpyxl

from app.analysis import analyze

fails = []
def expect(label, cond, info=""):
    if not cond:
        fails.append((label, info))

def col(r, name):
    return next(c for c in r["columns"] if c["name"] == name)

# 1 numeric formats, exact statistics
for seed in range(40):
    rng = random.Random(seed)
    vals = [round(rng.uniform(1, 90000), 2) for _ in range(rng.randint(5, 300))]
    style = seed % 5
    def fmtv(v):
        if style == 0: return f"{v:,.2f}"
        if style == 1: return f"฿{v:,.2f}"
        if style == 2: return f"{v:.2f}"
        if style == 3: return f"{v:,.2f} บาท"
        return f"{v:.2f}".replace(".", ",") if v < 1000 else f"{v:,.2f}"
    if style == 4:
        vals = [round(v % 999, 2) for v in vals]
    text = "id,price\n" + "\n".join(f'{i},"{fmtv(v)}"' for i, v in enumerate(vals)) + "\n"
    r = analyze(text.encode(), "n.csv")
    c = col(r, "price")
    expect(f"num-type-{style}", c["type"] == "numeric", (seed, c["type"]))
    if c["stats"]:
        expect(f"num-mean-{style}", abs(c["stats"]["mean"] - statistics.fmean(vals)) < 0.01, (seed, c["stats"]["mean"], statistics.fmean(vals)))
        expect(f"num-median-{style}", abs(c["stats"]["median"] - statistics.median(vals)) < 0.01, seed)
        expect(f"num-min-max-{style}", c["stats"]["min"] == min(vals) and c["stats"]["max"] == max(vals), seed)

# 2 CSV hardness
tricky = 'id,note,qty\r\n1,"has, comma",5\r\n2,"line1\nline2",6\r\n3,"quote ""inside""",7\r\n\r\n4,plain,8\r\n'
r = analyze(tricky.encode(), "t.csv")
expect("tricky-rows", r["rows"] in (4,), r["rows"])
for ending in ("\r\n", "\r", "\n"):
    text = ("id,v\n1,10\n2,20\n3,30\n").replace("\n", ending)
    try:
        r = analyze(text.encode(), "e.csv")
        expect(f"eol-{ending!r}", r["rows"] == 3, r["rows"])
    except Exception as exc:
        expect(f"eol-{ending!r}", False, repr(exc))
r = analyze(b"id,v\n1,10\n2,20\n\n\n", "blank.csv")
expect("trailing-blank-lines", r["rows"] == 2, r["rows"])
r = analyze(b"id,v\n1,  \n2,20\n3,\t\n", "ws.csv")
expect("whitespace-cells-missing", r["missing"] == 2, r["missing"])

# 3 degenerate shapes
r = analyze(b"only\n1\n2\n3\n", "one.csv")
expect("one-column", r["column_count"] == 1 and r["rows"] == 3, r["column_count"])
r = analyze(b"a,b\n1,2\n", "one-row.csv")
expect("one-row", r["rows"] == 1, r["rows"])
r = analyze(b"a,b,c\n1,,3\n2,,4\n3,,5\n", "allmissing.csv")
expect("all-missing-column", col(r, "b")["missing"] == 3, col(r, "b"))
r = analyze(b"a,b\n1,x\n2,x\n3,x\n", "const.csv")
expect("constant-column", col(r, "b")["unique"] == 1)

# 4 personal data false positives / negatives
rng = random.Random(1)
def thai_id():
    d = [rng.randint(1, 8)] + [rng.randint(0, 9) for _ in range(11)]
    total = sum(x * (13 - i) for i, x in enumerate(d))
    return "".join(map(str, d)) + str((11 - total % 11) % 10)
ids = [thai_id() for _ in range(50)]
r = analyze(("pid,amt\n" + "\n".join(f"{v},{i}" for i, v in enumerate(ids)) + "\n").encode(), "id.csv")
expect("thai-id-detected", col(r, "pid")["pattern"] == "thai_national_id", col(r, "pid")["pattern"])
orders = [str(rng.randint(10**12, 10**13 - 1)) for _ in range(200)]
r = analyze(("ref,amt\n" + "\n".join(f"{v},{i}" for i, v in enumerate(orders)) + "\n").encode(), "ref.csv")
expect("13-digit-order-numbers-not-personal", col(r, "ref")["pattern"] is None, col(r, "ref")["pattern"])
skus = [f"0{rng.randint(2,9)}{rng.randint(10**6, 10**7-1)}" for _ in range(100)]
r = analyze(("sku,amt\n" + "\n".join(f"{v},{i}" for i, v in enumerate(skus)) + "\n").encode(), "sku.csv")
expect("sku-looking-like-phone", col(r, "sku")["pattern"] in (None, "thai_phone"), col(r, "sku")["pattern"])
print("sku pattern:", col(r, "sku")["pattern"])
phones = [f"08{rng.randint(10**7, 10**8-1)}" for _ in range(60)]
r = analyze(("contact,amt\n" + "\n".join(f"{v},{i}" for i, v in enumerate(phones)) + "\n").encode(), "ph.csv")
expect("phone-detected", col(r, "contact")["pattern"] == "thai_phone", col(r, "contact")["pattern"])
fmtphones = [f"08{rng.randint(1,9)}-{rng.randint(100,999)}-{rng.randint(1000,9999)}" for _ in range(60)]
r = analyze(("contact,amt\n" + "\n".join(f"{v},{i}" for i, v in enumerate(fmtphones)) + "\n").encode(), "ph2.csv")
expect("phone-with-dashes-detected", col(r, "contact")["pattern"] == "thai_phone", col(r, "contact")["pattern"])
intl = [f"+668{rng.randint(10**7, 10**8-1)}" for _ in range(60)]
r = analyze(("contact,amt\n" + "\n".join(f"{v},{i}" for i, v in enumerate(intl)) + "\n").encode(), "ph3.csv")
print("intl +66 phone pattern:", col(r, "contact")["pattern"])
emails = [f"p{i}@mail.com" for i in range(30)]
r = analyze(("email,amt\n" + "\n".join(f"{v},{i}" for i, v in enumerate(emails)) + "\n").encode(), "em.csv")
print("email personal flagged:", "email" , [i["title"] for i in r["executive"]["issues"]])

# 5 dates
cases = {
 "iso": ["2024-03-15", "2024-04-01", "2024-12-31"],
 "dmy-slash": ["15/03/2024", "01/04/2024", "31/12/2024"],
 "be": ["15/03/2567", "01/04/2567", "31/12/2567"],
 "thai-month": ["15 มีนาคม 2567", "1 เมษายน 2567", "31 ธันวาคม 2567"],
 "datetime": ["2024-03-15 10:30:00", "2024-04-01 08:00", "2024-12-31T23:59:59"],
 "short-month": ["15 Mar 2024", "1 Apr 2024", "31 Dec 2024"],
 "dots": ["15.03.2024", "01.04.2024", "31.12.2024"],
}
for name, vals in cases.items():
    r = analyze(("id,d\n" + "\n".join(f"{i},{v}" for i, v in enumerate(vals)) + "\n").encode(), "d.csv")
    expect(f"date-{name}", col(r, "d")["type"] == "datetime" and col(r, "d")["invalid"] == 0, (col(r, "d")["type"], col(r, "d")["invalid"]))
r = analyze(("id,d\n" + "\n".join(f"{i},{v}" for i, v in enumerate(["2024-02-30", "2024-13-01", "2024-02-29", "2023-02-29"])) + "\n").encode(), "bad.csv")
expect("invalid-calendar-dates", col(r, "d")["invalid"] == 3, col(r, "d")["invalid"])

# 6 excel specifics
wb = openpyxl.Workbook(); ws = wb.active
ws.append(["id", "when", "amount", "flag", "note"])
ws.append([1, datetime.datetime(2024, 3, 15, 9, 30), 12.5, True, "ok"])
ws.append([2, datetime.date(2024, 3, 16), 7, False, None])
ws.append([3, None, "=1+1", True, "x"])
ws.append([4, datetime.datetime(2024, 3, 18), 1e6, False, "y"])
b = io.BytesIO(); wb.save(b)
r = analyze(b.getvalue(), "x.xlsx")
print("xlsx types:", [(c["name"], c["type"], c["missing"]) for c in r["columns"]])
expect("xlsx-when-date", col(r, "when")["type"] == "datetime")
expect("xlsx-flag-bool", col(r, "flag")["type"] == "boolean", col(r, "flag")["type"])

# 7 json shapes
data = [{"id": 1, "a": {"b": 2}, "tags": ["x", "y"], "ok": True}, {"id": 2, "a": {"b": None}, "ok": False}, {"id": 3, "extra": 5}]
r = analyze(json.dumps(data).encode(), "j.json")
print("json cols:", [c["name"] for c in r["columns"]], r["rows"])
jl = "\n".join(json.dumps({"id": i, "v": i * 2}) for i in range(5))
r = analyze(jl.encode(), "j.jsonl")
expect("jsonl", r["rows"] == 5, r["rows"])
r = analyze(json.dumps({"data": [{"id": 1}, {"id": 2}]}).encode(), "wrapped.json")
expect("json-wrapped", r["rows"] == 2, r["rows"])

# 8 header detection
r = analyze(b"name,city,team\nAnna,Rome,Red\nBen,Oslo,Blue\n", "texthdr.csv")
print("all-text header used:", r["header"]["used"], r["header"]["detected"])
r = analyze(b"2020,2021,2022\n1,2,3\n4,5,6\n", "yearhdr.csv")
print("year header used:", r["header"]["used"])
r = analyze(b"1,2,3\n4,5,6\n7,8,9\n", "nums.csv")
expect("numeric-data-no-header", r["header"]["used"] is False, r["header"])
print("FAILS:", len(fails))
for f in fails: print(f)
