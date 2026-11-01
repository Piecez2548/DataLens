import random
import sys
import time
from collections import Counter

from app.analysis import analyze
from tests.corpus import build, to_csv_bytes, to_json_bytes, to_xlsx_bytes

N = int(sys.argv[1]) if len(sys.argv) > 1 else 300
bad = Counter()
examples = []
slow = []
for seed in range(N):
    rng = random.Random(seed)
    header, rows, truth, meta = build(seed, bool(seed % 2))
    rows = rows[:200]
    kind = rng.choice(["csv", "xlsx", "json"])
    data = {"csv": lambda: to_csv_bytes(header, rows), "xlsx": lambda: to_xlsx_bytes(header, rows), "json": lambda: to_json_bytes(header, rows)}[kind]()
    name = {"csv": "f.csv", "xlsx": "f.xlsx", "json": "f.json"}[kind]
    b = bytearray(data)
    mutation = rng.choice(["flip", "truncate", "insert", "dup-chunk", "quotes", "none"])
    if mutation == "flip":
        for _ in range(rng.randint(1, 20)):
            b[rng.randrange(len(b))] = rng.randrange(256)
    elif mutation == "truncate":
        b = b[: rng.randrange(1, len(b))]
    elif mutation == "insert":
        pos = rng.randrange(len(b)); b[pos:pos] = bytes(rng.randrange(256) for _ in range(rng.randint(1, 30)))
    elif mutation == "dup-chunk":
        a = rng.randrange(len(b)); c = a + rng.randint(1, 200); b[a:a] = b[a:c]
    elif mutation == "quotes":
        for _ in range(rng.randint(1, 10)):
            pos = rng.randrange(len(b)); b[pos:pos] = b'"'
    t = time.time()
    try:
        r = analyze(bytes(b), name)
        # invariants on success
        assert r["rows"] >= 1 and r["column_count"] >= 1
        assert len(r["columns"]) == r["column_count"]
        for k, v in r["scores"].items():
            assert v is None or 0 <= v <= 100, (k, v)
        assert r["problem_rows"]["listed"] <= r["problem_rows"]["total"]
        assert all(0 < e["row"] for kd in r["issue_samples"]["kinds"].values() for e in kd["examples"])
    except ValueError:
        pass
    except Exception as exc:  # anything else would be an HTTP 500
        bad[type(exc).__name__] += 1
        if len(examples) < 10:
            examples.append((seed, kind, mutation, repr(exc)[:160]))
    if time.time() - t > 3:
        slow.append((seed, kind, mutation, round(time.time() - t, 1)))
print("runs:", N, "unexpected:", dict(bad), "slow:", slow[:5])
for e in examples:
    print(e)
