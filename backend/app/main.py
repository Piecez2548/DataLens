import hashlib
import json
import os

from fastapi import Depends, FastAPI, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .analysis import MAX_BYTES, analyze
from .security import UserContext, auth_required, current_user, new_audit_event

UPLOAD_LIMIT = 4 * 1024 * 1024 if os.environ.get("VERCEL") else MAX_BYTES


class AuditRequest(BaseModel):
    analysis_id: str = Field(pattern=r"^[a-f0-9]{64}$")
    note: str = Field(default="", max_length=500)

app = FastAPI(title="DataLens API", version="0.6.1")
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
        allowed_governance = {"owner", "source_url", "verified_at", "classification", "purpose"}
        if set(declared) - allowed_governance or not all(isinstance(value, str) for value in declared.values()):
            raise HTTPException(400, "Governance metadata contains unsupported fields.")
        if any(len(value) > 500 for value in declared.values()):
            raise HTTPException(400, "Governance metadata is too long.")
        if declared.get("classification") not in {None, "public", "internal", "confidential"}:
            raise HTTPException(400, "Data classification is invalid.")
        if declared.get("source_url") and not declared["source_url"].startswith("https://"):
            raise HTTPException(400, "Source URL must use HTTPS.")
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
        result["audit_event"] = new_audit_event("analysis.completed", actor, analysis_id, {"filename": file.filename})
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        await file.close()


@app.post("/api/audit/review")
async def review_analysis(payload: AuditRequest, actor: UserContext = Depends(current_user)):
    return new_audit_event("analysis.reviewed", actor, payload.analysis_id, {"note": payload.note})


@app.post("/api/audit/approve")
async def approve_analysis(payload: AuditRequest, actor: UserContext = Depends(current_user)):
    if actor.role not in {"admin", "approver", "developer"}:
        raise HTTPException(403, "An approver or administrator role is required.")
    return new_audit_event("analysis.approved", actor, payload.analysis_id, {"note": payload.note})
