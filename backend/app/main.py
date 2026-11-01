import json
import os

from fastapi import FastAPI, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from .analysis import MAX_BYTES, analyze
from .security import is_hosted

UPLOAD_LIMIT = 4 * 1024 * 1024 if os.environ.get("VERCEL") else MAX_BYTES


app = FastAPI(title="DataLens API", version="0.8.0")
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
    return {"status": "ok", "version": app.version}


@app.post("/api/analyze")
async def upload(
    file: UploadFile,
    header_mode: str = Query("auto", pattern="^(auto|present|absent)$"),
    schema_config_json: str | None = Form(None, alias="schema"),
):
    try:
        if not (file.filename or "").lower().endswith((".csv", ".xlsx", ".json", ".jsonl", ".ndjson")):
            raise HTTPException(400, "Please upload a .csv, .xlsx or .json file.")
        content = await file.read(UPLOAD_LIMIT + 1)
        if len(content) > UPLOAD_LIMIT:
            raise HTTPException(413, f"CSV exceeds the {UPLOAD_LIMIT // (1024 * 1024)} MB limit.")
        try:
            schema_config = json.loads(schema_config_json) if schema_config_json else {}
        except json.JSONDecodeError as exc:
            raise HTTPException(400, "Schema configuration is not valid JSON.") from exc
        if not isinstance(schema_config, dict):
            raise HTTPException(400, "Schema configuration must be an object.")
        attested = schema_config.get("authorized_to_process", False)
        if not isinstance(attested, bool):
            raise HTTPException(400, "Authorization attestation must be true or false.")
        if is_hosted() and not attested:
            raise HTTPException(400, "Authorization for this non-personal file must be attested before analysis.")
        result = await run_in_threadpool(
            analyze,
            content,
            file.filename,
            header_mode,
            schema_config.get("column_names"),
            schema_config.get("type_overrides"),
            schema_config.get("business_rules"),
            schema_config.get("missing_markers"),
            schema_config.get("sheet"),
            schema_config.get("header_row"),
            schema_config.get("date_order"),
            schema_config.get("business_key"),
            schema_config.get("group_by"),
            schema_config.get("year_era"),
        )
        return result
    except (TypeError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        await file.close()
