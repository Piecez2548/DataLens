import json

import pytest
from fastapi.testclient import TestClient

from app.analysis import analyze
from app.main import app


def test_scores_and_statistics():
    result = analyze(b"amount,group\n10,A\n20,B\n20,B\n,C\n", "demo.csv")
    assert result["scores"] == {
        "Completeness": 87.5,
        "Consistency": 100,
        "Uniqueness": 75,
        "Validity": 100,
        "Overall": 90.62,
    }
    assert result["columns"][0]["stats"]["median"] == 20
    assert result["duplicates"] == 1
    assert result["preview"][3]["amount"] is None


def test_mixed_types_and_validity_are_distinct():
    result = analyze(b"n,date\n1,2024-01-01\n2,2024-02-30\n3,2024-01-03\ninf,2024-01-04\noops,bad\n", "mixed.csv")
    assert result["scores"]["Consistency"] == 80
    assert result["scores"]["Validity"] == 75
    assert result["columns"][0]["stats"]["count"] == 3


@pytest.mark.parametrize("content", [b"", b"a\n", b"a,a\n1,2", b"a,b\n1,2,3", b"a\n\xff", b"a\n\x00"])
def test_reject_bad_csv(content):
    with pytest.raises(ValueError):
        analyze(content, "bad.csv")


def test_all_missing_and_single_value():
    result = analyze(b"a,b\n,\n", "empty-values.csv")
    assert result["scores"]["Consistency"] is None
    assert result["scores"]["Validity"] is None
    assert result["scores"]["Overall"] == 50
    assert analyze(b"a\n3\n", "one.csv")["columns"][0]["stats"]["std"] == 0


def test_api_upload():
    client = TestClient(app)
    assert client.get("/api/health").status_code == 200
    response = client.post("/api/analyze", files={"file": ("demo.csv", b"x,y\n1,2\n3,4")})
    assert response.status_code == 200
    assert response.json()["scatter"] == [{"x": 1, "y": 2}, {"x": 3, "y": 4}]
    assert client.post("/api/analyze", files={"file": ("bad.txt", b"x\n1")}).status_code == 400
    assert client.post("/api/analyze", files={"file": ("bad.csv", b"x\n")}).status_code == 400


def test_headerless_csv_keeps_first_record_and_warns_executives():
    content = b"1,Marie,100.00\n2,Alex,250.00\n3,Sam,125.00\n"
    result = analyze(content, "customers.csv")
    assert result["rows"] == 3
    assert result["header"]["generated_names"] is True
    assert result["columns"][0]["name"] == "column_1"
    assert result["preview"][0]["column_2"] == "Marie"
    assert result["executive"]["status"] == "Review needed"
    assert result["executive"]["issues"][0]["title"] == "Column names are missing"


def test_header_mode_can_override_detection():
    content = b"id,name\n1,Ada\n2,Grace\n"
    result = analyze(content, "people.csv", "absent")
    assert result["rows"] == 3
    assert result["header"]["used"] is False
    assert result["preview"][0] == {"column_1": "id", "column_2": "name"}


def test_executive_summary_prioritizes_invalid_values():
    result = analyze(b"date\n2026-02-30\n2026-01-01\n", "dates.csv", "present")
    assert result["executive"]["status"] == "Action required"
    assert result["executive"]["high_priority_count"] == 1


def test_api_accepts_header_override():
    client = TestClient(app)
    response = client.post(
        "/api/analyze?header_mode=absent",
        files={"file": ("demo.csv", b"1,A\n2,B\n")},
    )
    assert response.status_code == 200
    assert response.json()["rows"] == 2
    assert response.json()["header"]["generated_names"] is True


def test_semantic_email_and_identifier_detection_improve_validity_scope():
    result = analyze(
        b"customer_id,email\n1,ada@example.com\n2,invalid\n3,grace@example.com\n",
        "contacts.csv",
    )
    assert result["columns"][0]["type"] == "identifier"
    assert result["columns"][1]["type"] == "email"
    assert result["columns"][1]["invalid"] == 1
    assert result["scores"]["Validity"] == 66.67
    assert result["executive"]["status"] == "Action required"


def test_iqr_outliers_and_strongest_correlation_are_reported():
    result = analyze(
        b"amount,revenue\n1,10\n2,20\n3,30\n4,40\n100,1000\n",
        "metrics.csv",
    )
    assert result["columns"][0]["outliers"] == 1
    assert result["correlations"][0]["coefficient"] > 0.99
    assert result["scatter_axes"] == ["amount", "revenue"]
    assert result["executive"]["signals"]


def test_schema_configuration_names_columns_without_dropping_first_row():
    result = analyze(
        b"1,ada@example.com\n2,grace@example.com\n",
        "contacts.csv",
        "absent",
        ["customer_id", "email"],
        {"customer_id": "identifier", "email": "email"},
    )
    assert result["rows"] == 2
    assert result["header"]["configured_names"] is True
    assert result["header"]["generated_names"] is False
    assert [column["type"] for column in result["columns"]] == ["identifier", "email"]


def test_api_accepts_schema_configuration():
    client = TestClient(app)
    schema = json.dumps({"column_names": ["customer_id", "email"], "type_overrides": {"email": "email"}})
    response = client.post(
        "/api/analyze?header_mode=absent",
        files={"file": ("contacts.csv", b"1,ada@example.com\n2,bad\n"), "schema": (None, schema)},
    )
    assert response.status_code == 200
    assert response.json()["columns"][1]["invalid"] == 1


def test_provenance_fingerprints_the_exact_input_without_generating_values():
    content = b"id,value\n1,10\n2,20\n"
    result = analyze(content, "evidence.csv")
    assert result["provenance"] == {
        "source": "uploaded_file",
        "sha256": "159f8bae5fa563fb61b540de391850552f9fe1d188273b1ca9ce182e4cbf4a26",
        "input_bytes": len(content),
        "file_rows": 3,
        "analyzed_rows": 2,
        "preview_rows": 2,
        "method_version": "0.7.1",
        "source_format": "csv",
        "sheet": None,
        "encoding": "utf-8",
        "delimiter": "comma",
        "missing_markers": [],
        "calculation_mode": "deterministic",
        "data_values_generated": False,
    }


def test_embedded_table_delimiters_require_structural_review():
    result = analyze(
        b'ID,| Category | Product |\n1,"| Drinks | Water |"\n2,"| Food | Rice |"\n',
        "products.csv",
    )
    assert result["scores"]["Overall"] == 100
    assert result["executive"]["status"] == "Review needed"
    assert any("embedded" in issue["title"].lower() for issue in result["executive"]["issues"])


def test_iqr_flags_minority_values_when_middle_half_is_constant():
    result = analyze(b"volume\n180\n180\n180\n180\n200\n", "volume.csv")
    assert result["columns"][0]["stats"]["q1"] == 180
    assert result["columns"][0]["stats"]["q3"] == 180
    assert result["columns"][0]["outliers"] == 1


def test_business_rules_are_auditable_and_block_executive_readiness():
    result = analyze(
        b"region,amount\nTH,10\nUS,200\n,50\n",
        "rules.csv",
        business_rules={
            "region": {"required": True, "allowed_values": ["TH"]},
            "amount": {"min": 20, "max": 100},
        },
    )
    assert result["business_rules"]["total_violations"] == 4
    assert result["business_rules"]["passed"] is False
    assert result["executive"]["status"] == "Action required"


def test_analysis_needs_no_account_and_events_carry_no_identity(monkeypatch):
    monkeypatch.setenv("DATALENS_AUDIT_SECRET", "test-only-secret")
    schema = json.dumps({"governance": {"authorized_to_process": True}})
    response = TestClient(app).post(
        "/api/analyze",
        files={"file": ("demo.csv", b"x\n1\n"), "schema": (None, schema)},
    )
    body = response.json()
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store, max-age=0"
    assert not any(key.startswith("actor") for key in body["governance"])
    assert not any(key.startswith("actor") for key in body["audit_event"])


def test_health_reports_no_authentication_requirement():
    assert TestClient(app).get("/api/health").json() == {"status": "ok", "version": app.version}


def test_hosted_analysis_requires_the_non_personal_data_attestation(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("DATALENS_AUDIT_SECRET", "test-only-secret")
    client = TestClient(app)
    refused = client.post("/api/analyze", files={"file": ("demo.csv", b"x\n1\n")})
    assert refused.status_code == 400
    schema = json.dumps({"governance": {"authorized_to_process": True}})
    accepted = client.post("/api/analyze", files={"file": ("demo.csv", b"x\n1\n"), "schema": (None, schema)})
    assert accepted.status_code == 200


def test_hosted_deployment_fails_closed_without_an_audit_secret(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("DATALENS_AUDIT_SECRET", raising=False)
    schema = json.dumps({"governance": {"authorized_to_process": True}})
    response = TestClient(app).post(
        "/api/analyze",
        files={"file": ("demo.csv", b"x\n1\n"), "schema": (None, schema)},
    )
    assert response.status_code == 503


def test_review_and_approval_require_bound_signed_evidence():
    client = TestClient(app)
    schema = json.dumps(
        {
            "governance": {
                "owner": "Finance",
                "purpose": "Monthly review",
                "classification": "internal",
                "authorized_to_process": True,
            },
            "business_rules": {"amount": {"min": 0}},
        }
    )
    analysis = client.post(
        "/api/analyze?header_mode=present",
        files={"file": ("demo.csv", b"amount\n10\n"), "schema": (None, schema)},
    ).json()
    payload = {
        "analysis_id": analysis["governance"]["analysis_id"],
        "analysis_event": analysis["audit_event"],
        "note": "Evidence checked",
    }
    reviewed = client.post("/api/audit/review", json=payload)
    approved = client.post("/api/audit/approve", json={**payload, "review_event": reviewed.json()})
    assert reviewed.status_code == 200
    assert approved.status_code == 200
    assert reviewed.json()["signature_algorithm"] == "HMAC-SHA256"
    assert approved.json()["action"] == "analysis.approved"


def test_audit_rejects_fabricated_or_tampered_analysis_evidence():
    client = TestClient(app)
    fabricated = {
        "analysis_id": "a" * 64,
        "analysis_event": {
            "action": "analysis.completed",
            "analysis_id": "a" * 64,
            "signature": "0" * 64,
            "signature_algorithm": "HMAC-SHA256",
        },
    }
    assert client.post("/api/audit/review", json=fabricated).status_code == 400


def test_approval_rejects_incomplete_analysis_even_with_valid_service_event():
    client = TestClient(app)
    analysis = client.post(
        "/api/analyze?header_mode=present",
        files={"file": ("demo.csv", b"amount\n10\n")},
    ).json()
    payload = {
        "analysis_id": analysis["governance"]["analysis_id"],
        "analysis_event": analysis["audit_event"],
    }
    review = client.post("/api/audit/review", json=payload).json()
    response = client.post("/api/audit/approve", json={**payload, "review_event": review})
    assert response.status_code == 409


def test_numeric_business_rule_rejects_a_text_column():
    with pytest.raises(ValueError, match="require a numeric column"):
        analyze(
            b"region\nThailand\nJapan\n",
            "regions.csv",
            business_rules={"region": {"min": 0}},
        )


def test_auto_header_does_not_drop_an_ambiguous_text_row():
    result = analyze(b"Al,NY\nCharlotte,California\nBenjamin,Washington\n", "places.csv")
    assert result["header"]["used"] is False
    assert result["rows"] == 3
    assert result["preview"][0] == {"column_1": "Al", "column_2": "NY"}


@pytest.mark.parametrize(
    ("content", "expected_type"),
    [
        (b"amount\n10\n20\noops\n", "numeric"),
        (b"date\n2024-01-01\n2024-01-02\nbad\n", "datetime"),
        (b"flag\ntrue\nfalse\nmaybe\n", "boolean"),
    ],
)
def test_dominant_typed_values_expose_dirty_minority(content, expected_type):
    result = analyze(content, "dirty.csv", "present")
    assert result["columns"][0]["type"] == expected_type
    assert result["columns"][0]["mismatches"] == 1
    assert result["scores"]["Overall"] < 100
    assert result["executive"]["status"] == "Review needed"


def test_sequential_business_measures_remain_numeric():
    result = analyze(b"age,sales\n20,100\n21,101\n22,102\n23,103\n", "measures.csv")
    assert [column["type"] for column in result["columns"]] == ["numeric", "numeric"]
    assert result["columns"][0]["stats"]["mean"] == 21.5
    assert result["correlations"]


@pytest.mark.parametrize(("delimiter", "label"), [(b";", "semicolon"), (b"\t", "tab"), (b"|", "pipe")])
def test_alternate_delimiters_are_detected(delimiter, label):
    content = delimiter.join([b"name", b"amount"]) + b"\n" + delimiter.join([b"A", b"10"]) + b"\n"
    result = analyze(content, "alt.csv")
    assert result["column_count"] == 2
    assert result["provenance"]["delimiter"] == label


def test_thai_windows_874_and_utf16_files_are_decoded():
    text = "ชื่อ,จำนวน\nสมชาย,10\nสมหญิง,20\n"
    legacy = analyze(text.encode("cp874"), "th.csv")
    assert legacy["provenance"]["encoding"] == "cp874"
    assert legacy["columns"][0]["name"] == "ชื่อ"
    utf16 = analyze(text.encode("utf-16"), "th16.csv")
    assert utf16["provenance"]["encoding"] == "utf-16"
    assert utf16["preview"][0]["ชื่อ"] == "สมชาย"
    assert analyze(text.encode("utf-8-sig"), "bom.csv")["provenance"]["encoding"] == "utf-8"


def test_undecodable_bytes_are_rejected():
    with pytest.raises(ValueError, match="encoded CSV"):
        analyze(b"a,b\n\xd8\xff,1\n\x81\x8d,2\n", "bad.csv")


def test_missing_issue_severity_uses_all_cells_as_denominator():
    headers = ",".join(f"c{i}" for i in range(100))
    values = ",".join([""] + ["x"] * 99)
    result = analyze(f"{headers}\n{values}\n".encode(), "wide.csv", "present")
    missing_issue = next(issue for issue in result["executive"]["issues"] if "missing" in issue["title"])
    assert result["scores"]["Completeness"] == 99
    assert missing_issue["severity"] == "medium"


def test_business_rule_findings_are_never_truncated():
    result = analyze(
        b'id,date,email,amount,embedded\n1,2024-02-30,bad,1,"| a | b |"\n1,2024-02-30,bad,,"| a | b |"\n100,2024-01-01,a@example.com,1000,"| a | b |"\n',
        "many-issues.csv",
        business_rules={"amount": {"required": True, "max": 100}},
    )
    assert len(result["executive"]["issues"]) == result["executive"]["issue_count"]
    assert any("business-rule" in issue["title"] for issue in result["executive"]["issues"])


def test_empty_or_disabled_rules_are_not_reported_as_configured():
    assert analyze(b"amount\n10\n", "rules.csv", business_rules={"amount": {}})["business_rules"]["configured"] is False
    assert analyze(b"amount\n10\n", "rules.csv", business_rules={"amount": {"required": False}})["business_rules"]["configured"] is False


def test_numeric_rule_rejects_boolean_and_inverted_range():
    with pytest.raises(ValueError, match="finite numbers"):
        analyze(b"amount\n10\n", "rules.csv", business_rules={"amount": {"min": True}})
    with pytest.raises(ValueError, match="no greater than maximum"):
        analyze(b"amount\n10\n", "rules.csv", business_rules={"amount": {"min": 20, "max": 10}})


def test_blank_physical_record_is_not_silently_discarded():
    with pytest.raises(ValueError, match="same number of fields"):
        analyze(b"value\n1\n\n2\n", "blank-row.csv", "present")


def _workbook(rows, sheet_title="Data"):
    import io

    import openpyxl

    workbook = openpyxl.Workbook()
    workbook.active.title = sheet_title
    for row in rows:
        workbook.active.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_missing_markers_count_literal_placeholders_as_missing():
    content = b"name,qty\nA,1\nB,N/A\nC,-\nD,null\n"
    assert analyze(content, "m.csv")["missing"] == 0
    result = analyze(content, "m.csv", missing_markers=["n/a", " - ", "NULL"])
    assert result["missing"] == 3
    assert result["provenance"]["missing_markers"] == ["-", "n/a", "null"]
    assert result["columns"][1]["type"] == "numeric"


def test_missing_markers_are_validated():
    with pytest.raises(ValueError, match="Missing markers"):
        analyze(b"a\n1\n", "m.csv", missing_markers=["x"] * 21)
    with pytest.raises(ValueError, match="Missing markers"):
        analyze(b"a\n1\n", "m.csv", missing_markers=[""])


def test_uneven_rows_are_located():
    with pytest.raises(ValueError, match=r"expected 2, but row 3 has 3, row 4 has 1"):
        analyze(b"a,b\n1,2\n3,4,5\n6\n", "uneven.csv")


def test_xlsx_first_sheet_is_read_with_dates_and_numbers():
    import datetime

    content = _workbook(
        [
            ["order_date", "amount", "paid"],
            [datetime.date(2024, 1, 5), 10.0, True],
            [datetime.date(2024, 3, 9), 12.5, False],
        ],
        "Sales",
    )
    result = analyze(content, "book.xlsx")
    assert result["rows"] == 2
    assert [c["type"] for c in result["columns"]] == ["datetime", "numeric", "boolean"]
    assert result["provenance"]["source_format"] == "xlsx"
    assert result["provenance"]["sheet"] == "Sales"
    assert result["provenance"]["delimiter"] is None
    assert len(result["provenance"]["sha256"]) == 64


def test_corrupt_xlsx_is_rejected():
    with pytest.raises(ValueError, match="could not be read"):
        analyze(b"PK\x03\x04not really a workbook", "bad.xlsx")


def test_thai_national_id_is_validated_and_flagged_as_personal_data():
    # 1101700230708 has a correct check digit; 1101700230706 does not.
    result = analyze("เลขบัตรประชาชน,จังหวัด\n1101700230708,A\n1101700230706,B\n".encode(), "ids.csv")
    column = result["columns"][0]
    assert column["pattern"] == "thai_national_id"
    assert column["type"] == "identifier"
    assert column["invalid"] == 1
    assert result["executive"]["status"] == "Action required"
    assert any("personal data" in issue["title"] for issue in result["executive"]["issues"])


def test_epoch_milliseconds_are_not_mistaken_for_national_ids():
    result = analyze(b"ts\n1700000000000\n1700000100000\n1700000200000\n", "ts.csv")
    assert result["columns"][0]["pattern"] is None


def test_thai_phone_numbers_are_flagged_as_personal_data():
    result = analyze(b"phone,v\n0812345678,1\n029876543,2\n", "phones.csv")
    assert result["columns"][0]["pattern"] == "thai_phone"
    assert result["executive"]["high_priority_count"] == 1


def test_timeseries_counts_periods_and_gaps():
    content = b"d\n2024-01-05\n2024-01-20\n2024-06-02\n2024-06-03\n"
    series = analyze(content, "ts.csv")["timeseries"]
    assert series["granularity"] == "month"
    assert [point["count"] for point in series["points"]] == [2, 0, 0, 0, 0, 2]
    assert series["gaps"] == 4
    assert (series["first"], series["last"]) == ("2024-01-05", "2024-06-03")
    assert analyze(b"x\n1\n", "n.csv")["timeseries"] is None


def test_day_first_slash_and_buddhist_era_dates_are_validated():
    result = analyze(
        b"date\n31/12/2024\n01/02/2567\n2024/03/15\n2024-05-06T10:30:00\n31/02/2024\n",
        "dates.csv",
    )
    column = result["columns"][0]
    assert column["type"] == "datetime"
    assert column["mismatches"] == 0
    assert column["invalid"] == 1
