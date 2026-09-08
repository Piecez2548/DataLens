import hashlib
import json
import os
from datetime import date

from fastapi import Depends, FastAPI, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .analysis import MAX_BYTES, analyze
from .security import UserContext, auth_required, current_user, new_audit_event, verify_audit_event

UPLOAD_LIMIT = 4 * 1024 * 1024 if os.environ.get("VERCEL") else MAX_BYTES


class AuditRequest(BaseModel):
    analysis_id: str = Field(pattern=r"^[a-f0-9]{64}$")
    analysis_event: dict
    review_event: dict | None = None
    note: str = Field(default="", max_length=500)

app = FastAPI(title="DataLens API", version="0.7.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        *[item for item in os.environ.get("DATALENS_ALLOWED_ORIGINS", "").split(",") if item],
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-Request-ID"] = request.headers.get("x-request-id") or os.urandom(12).hex()
    return response


@app.get("/api/health")
def health():
    return {"status": "ok", "version": app.version, "authentication_required": auth_required()}


@app.post("/api/analyze")
async def upload(
    file: UploadFile,
    header_mode: str = Query("auto", pattern="^(auto|present|absent)$"),
    schema_config_json: str | None = Form(None, alias="schema"),
    actor: UserContext = Depends(current_user),
):
    try:
        if not (file.filename or "").lower().endswith(".csv"):
            raise HTTPException(400, "Please upload a .csv file.")
        content = await file.read(UPLOAD_LIMIT + 1)
        if len(content) > UPLOAD_LIMIT:
            raise HTTPException(413, f"CSV exceeds the {UPLOAD_LIMIT // (1024 * 1024)} MB limit.")
        try:
            schema_config = json.loads(schema_config_json) if schema_config_json else {}
        except json.JSONDecodeError as exc:
            raise HTTPException(400, "Schema configuration is not valid JSON.") from exc
        if not isinstance(schema_config, dict):
            raise HTTPException(400, "Schema configuration must be an object.")
        declared = schema_config.get("governance", {})
        if not isinstance(declared, dict):
            raise HTTPException(400, "Governance metadata must be an object.")
        allowed_governance = {"owner", "source_url", "verified_at", "classification", "purpose", "authorized_to_process"}
        if set(declared) - allowed_governance:
            raise HTTPException(400, "Governance metadata contains unsupported fields.")
        text_values = {key: value for key, value in declared.items() if key != "authorized_to_process"}
        if not all(isinstance(value, str) for value in text_values.values()):
            raise HTTPException(400, "Governance metadata contains invalid values.")
        if "authorized_to_process" in declared and not isinstance(declared["authorized_to_process"], bool):
            raise HTTPException(400, "Authorization attestation must be true or false.")
        if any(len(value) > 500 for value in text_values.values()):
            raise HTTPException(400, "Governance metadata is too long.")
        if declared.get("classification") not in {None, "", "public", "internal", "confidential"}:
            raise HTTPException(400, "Data classification is invalid.")
        if declared.get("source_url") and not declared["source_url"].startswith("https://"):
            raise HTTPException(400, "Source URL must use HTTPS.")
        if declared.get("verified_at"):
            try:
                verified_date = date.fromisoformat(declared["verified_at"])
            except ValueError as exc:
                raise HTTPException(400, "Source checked date must use YYYY-MM-DD.") from exc
            if verified_date > date.today():
                raise HTTPException(400, "Source checked date cannot be in the future.")
        if auth_required() and declared.get("authorized_to_process") is not True:
            raise HTTPException(400, "Authorization for this non-personal file must be attested before analysis.")
        result = await run_in_threadpool(
            analyze,
            content,
            file.filename,
            header_mode,
            schema_config.get("column_names"),
            schema_config.get("type_overrides"),
            schema_config.get("business_rules"),
        )
        analysis_id = hashlib.sha256(
            f"{result['provenance']['sha256']}:{json.dumps(schema_config, sort_keys=True)}:{app.version}".encode()
        ).hexdigest()
        result["governance"] = {
            "analysis_id": analysis_id,
            "actor_id": actor.id,
            "actor_email": actor.email,
            "actor_role": actor.role,
            "retention": "request_only",
            "server_storage": False,
            "cache_control": "no-store",
            "declared": declared,
        }
        governance_complete = bool(
            declared.get("owner", "").strip()
            and declared.get("purpose", "").strip()
            and declared.get("classification")
            and declared.get("authorized_to_process") is True
        )
        if declared.get("classification") == "public":
            governance_complete = bool(
                governance_complete and declared.get("source_url") and declared.get("verified_at")
            )
        result["audit_event"] = new_audit_event(
            "analysis.completed",
            actor,
            analysis_id,
            {
                "filename": file.filename,
                "source_sha256": result["provenance"]["sha256"],
                "method_version": result["provenance"]["method_version"],
                "status": result["executive"]["status"],
                "rules_configured": result["business_rules"]["configured"],
                "rules_passed": result["business_rules"]["passed"],
                "governance_complete": governance_complete,
                "authorized_to_process": declared.get("authorized_to_process") is True,
                "header_confirmed": header_mode != "auto",
            },
        )
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        await file.close()


@app.post("/api/audit/review")
async def review_analysis(payload: AuditRequest, actor: UserContext = Depends(current_user)):
    analysis_event = verify_audit_event(payload.analysis_event)
    if analysis_event.get("action") != "analysis.completed" or analysis_event.get("analysis_id") != payload.analysis_id:
        raise HTTPException(400, "The analysis evidence does not match this analysis.")
    return new_audit_event(
        "analysis.reviewed",
        actor,
        payload.analysis_id,
        {"note": payload.note, "analysis_event_signature": analysis_event["signature"]},
    )


@app.post("/api/audit/approve")
async def approve_analysis(payload: AuditRequest, actor: UserContext = Depends(current_user)):
    if actor.role not in {"admin", "approver"} and not (not auth_required() and actor.role == "developer"):
        raise HTTPException(403, "An approver or administrator role is required.")
    analysis_event = verify_audit_event(payload.analysis_event)
    review_event = verify_audit_event(payload.review_event or {})
    if analysis_event.get("action") != "analysis.completed" or analysis_event.get("analysis_id") != payload.analysis_id:
        raise HTTPException(400, "The analysis evidence does not match this analysis.")
    details = analysis_event.get("details", {})
    if not isinstance(details, dict) or not all(
        [
            details.get("status") == "Ready for exploration",
            details.get("rules_configured") is True,
            details.get("rules_passed") is True,
            details.get("governance_complete") is True,
            details.get("authorized_to_process") is True,
            details.get("header_confirmed") is True,
        ]
    ):
        raise HTTPException(409, "Complete the source declaration, confirm the header, and pass configured rules first.")
    if (
        review_event.get("action") != "analysis.reviewed"
        or review_event.get("analysis_id") != payload.analysis_id
        or review_event.get("details", {}).get("analysis_event_signature") != analysis_event["signature"]
    ):
        raise HTTPException(400, "A verified review of this exact analysis is required.")
    return new_audit_event(
        "analysis.approved",
        actor,
        payload.analysis_id,
        {
            "note": payload.note,
            "analysis_event_signature": analysis_event["signature"],
            "review_event_signature": review_event["signature"],
        },
    )
