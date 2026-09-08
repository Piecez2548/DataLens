import pytest
import json
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


def test_api_requires_a_session_when_enterprise_auth_is_enabled(monkeypatch):
    monkeypatch.setenv("DATALENS_AUTH_REQUIRED", "true")
    client = TestClient(app)
    response = client.post("/api/analyze", files={"file": ("demo.csv", b"x\n1\n")})
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store, max-age=0"


def test_hosted_deployment_fails_closed_when_auth_flag_is_missing(monkeypatch):
    monkeypatch.delenv("DATALENS_AUTH_REQUIRED", raising=False)
    monkeypatch.setenv("VERCEL", "1")
    response = TestClient(app).post("/api/analyze", files={"file": ("demo.csv", b"x\n1\n")})
    assert response.status_code == 401


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


def test_valid_supabase_session_is_verified_and_actor_is_recorded(monkeypatch):
    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {
                "id": "user-123",
                "email": "analyst@example.com",
                "app_metadata": {"role": "analyst"},
            }

    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, *_args, **_kwargs):
            return Response()

    monkeypatch.setenv("DATALENS_AUTH_REQUIRED", "true")
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-key")
    monkeypatch.setenv("DATALENS_ALLOWED_ROLES", "analyst")
    monkeypatch.setenv("DATALENS_AUDIT_SECRET", "test-only-secret")
    monkeypatch.setattr("app.security.httpx.AsyncClient", Client)
    schema = {
            "governance": {
                "owner": "Finance",
                "purpose": "Monthly review",
                "classification": "internal",
                "authorized_to_process": True,
            }
    }
    response = TestClient(app).post(
        "/api/analyze",
        headers={"Authorization": "Bearer valid-token"},
        files={"file": ("demo.csv", b"amount\n10\n")},
        data={"schema": json.dumps(schema)},
    )
    assert response.status_code == 200
    assert response.json()["governance"]["actor_id"] == "user-123"
    assert response.json()["governance"]["actor_role"] == "analyst"


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


@pytest.mark.parametrize("delimiter", [b";", b"\t"])
def test_likely_alternate_delimiter_is_rejected(delimiter):
    content = delimiter.join([b"name", b"amount"]) + b"\n" + delimiter.join([b"A", b"10"]) + b"\n"
    with pytest.raises(ValueError, match="semicolon or tab delimiter"):
        analyze(content, "wrong-delimiter.csv")


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
