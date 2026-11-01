import random

import numpy as np
import pandas as pd

from app.analysis import analyze

fails = []


def expect(label, cond, info=""):
    if not cond:
        fails.append((label, info))


def col(r, name):
    return next(c for c in r["columns"] if c["name"] == name)


for seed in range(60):
    rng = random.Random(seed)
    n = rng.randint(30, 800)
    df = pd.DataFrame(
        {
            "k": [f"K{rng.randint(1, max(3, n // 3))}" for _ in range(n)],
            "team": [rng.choice(["a", "b", "c", "d"]) for _ in range(n)],
            "amt": [round(rng.uniform(-50, 5000), 2) for _ in range(n)],
            "qty": [rng.randint(0, 40) for _ in range(n)],
            "day": [f"2024-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}" for _ in range(n)],
        }
    )
    # blanks
    for c in ("team", "amt"):
        for i in rng.sample(range(n), rng.randint(0, 6)):
            df.loc[i, c] = ""
    text = df.to_csv(index=False)
    r = analyze(text.encode(), "s.csv", business_key=["k"], group_by={"by": "team", "measure": "qty"})
    ref = df.replace("", np.nan)
    expect("rows", r["rows"] == n, (seed, r["rows"], n))
    cells = n * 5
    miss = int(ref.isna().sum().sum())
    expect("missing", r["missing"] == miss, (seed, r["missing"], miss))
    expect("dupe-rows", r["duplicates"] == int(df.duplicated().sum()), (seed, r["duplicates"], int(df.duplicated().sum())))
    expect("completeness", abs(r["scores"]["Completeness"] - 100 * (1 - miss / cells)) < 0.01, (seed, r["scores"]["Completeness"]))
    # key duplicates
    kd = r["key_duplicates"]
    if kd:
        expect("key-dupes", kd["duplicate_rows"] == int(df.duplicated(subset=["k"]).sum()), (seed, kd["duplicate_rows"], int(df.duplicated(subset=["k"]).sum())))
    # outliers via IQR
    amt = pd.to_numeric(ref["amt"], errors="coerce").dropna()
    q1, q3 = np.percentile(amt, [25, 75])
    iqr = q3 - q1
    exp_out = int(((amt < q1 - 1.5 * iqr) | (amt > q3 + 1.5 * iqr)).sum())
    expect("outliers-amt", col(r, "amt")["outliers"] == exp_out, (seed, col(r, "amt")["outliers"], exp_out))
    # stats
    st = col(r, "amt")["stats"]
    expect("mean", abs(st["mean"] - amt.mean()) < 1e-6, seed)
    expect("std", abs(st["std"] - amt.std(ddof=0)) < 1e-6, seed)
    # group summary
    gs = r["group_summary"]
    if gs:
        groups = {row["group"]: row for row in gs["rows"]}
        sub = ref.dropna(subset=["team"])
        for team, g in sub.groupby("team"):
            row = groups.get(team)
            if row is None:
                expect("group-missing", False, (seed, team)); continue
            expect("group-count", row["rows"] == len(g), (seed, team, row["rows"], len(g)))
            expect("group-sum", abs(row["sum"] - g["qty"].astype(float).sum()) < 1e-6, (seed, team, row["sum"], g["qty"].astype(float).sum()))
    # timeseries conservation
    ts = r["timeseries"]
    if ts:
        expect("ts-total", sum(p["count"] for p in ts["points"]) == n, (seed, sum(p["count"] for p in ts["points"]), n))
    # scores bounded
    for k, v in r["scores"].items():
        expect("score-range", v is None or 0 <= v <= 100, (seed, k, v))
    # business rules exact
    rr = analyze(text.encode(), "s.csv", business_rules={"amt": {"min": 0, "max": 1000}, "team": {"required": True, "allowed_values": ["a", "b"]}})
    viol = int(((amt < 0) | (amt > 1000)).sum())
    team_ref = ref["team"]
    viol_team = int(team_ref.isna().sum() + (team_ref.dropna().isin(["c", "d"])).sum())
    got = {}
    for x in rr["business_rules"]["results"]:
        got[x["column"]] = got.get(x["column"], 0) + x["violations"]
    expect("rule-amt", got.get("amt") == viol, (seed, got, viol))
    expect("rule-team", got.get("team") == viol_team, (seed, got, viol_team))

# row numbering with title rows and blank lines
for seed in range(30):
    rng = random.Random(seed)
    n = rng.randint(10, 100)
    rows = [f"{i},{rng.choice(['x', 'y'])},{rng.randint(1, 9)}" for i in range(n)]
    blank_at = sorted(rng.sample(range(1, n), min(3, n - 1)))
    missing_at = rng.sample([i for i in range(n) if i not in blank_at], 3)
    lines = ["Report title", "Prepared by X", "id,grp,val"]
    truth = set()
    kept = 0
    for i, line in enumerate(rows):
        if i in blank_at:
            lines.append("")
        if i in missing_at:
            parts = line.split(",")
            parts[1] = ""
            line = ",".join(parts)
            truth.add(len(lines) + 1)
        lines.append(line)
    # title rows have 1 field: use explicit header row
    r = analyze(("\n".join(lines) + "\n").encode(), "t.csv", header_row=3)
    located = {e["row"] for e in r["issue_samples"]["kinds"].get("missing", {"examples": []})["examples"]}
    expect("rownum-with-blanks", truth == located, (seed, sorted(truth), sorted(located)))
    expect("rows-with-blanks", r["rows"] == n, (seed, r["rows"], n))

# encodings round trip with Thai text
thai = ["กรุงเทพ", "เชียงใหม่", "ภูเก็ต", "ขอนแก่น"]
body = "id,city,amt\n" + "\n".join(f"{i},{thai[i % 4]},{i}" for i in range(20)) + "\n"
for enc in ("utf-8", "utf-8-sig", "utf-16", "cp874"):
    r = analyze(body.encode(enc), "th.csv")
    cities = {row["city"] for row in r["preview"]}
    expect(f"thai-{enc}", cities == set(thai), (enc, cities))
    expect(f"thai-{enc}-rows", r["rows"] == 20)
for delim in (",", ";", "\t", "|"):
    t = body.replace(",", delim)
    r = analyze(t.encode(), "d.csv")
    expect(f"delim-{delim!r}", r["column_count"] == 3 and r["rows"] == 20, (r["column_count"], r["rows"]))
# quoted delimiter inside text for semicolon files
t = 'id;note;amt\n1;"a;b";5\n2;"c;d";6\n3;"e;f";7\n'
r = analyze(t.encode(), "q.csv")
expect("semicolon-quoted", r["column_count"] == 3 and r["rows"] == 3, (r["column_count"], r["rows"]))
# missing markers
r = analyze(b"id,v\n1,NA\n2,n/a\n3,5\n4,-\n5,7\n", "m.csv", missing_markers=["NA", "n/a", "-"])
expect("markers", r["missing"] == 3, r["missing"])
# column names override + type override
r = analyze(b"1,2\n3,4\n", "o.csv", "absent", column_names=["a", "b"], type_overrides={"a": "identifier"})
expect("override", col(r, "a")["type"] == "identifier" and r["rows"] == 2)
print("FAILS:", len(fails))
for f in fails[:30]:
    print(f)
