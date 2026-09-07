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
        "method_version": "0.5.1",
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
