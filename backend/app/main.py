import json
import os
import zlib

from fastapi import FastAPI, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from .analysis import MAX_BYTES, analyze, redact_columns
from .security import is_hosted

UPLOAD_LIMIT = 4 * 1024 * 1024 if os.environ.get("VERCEL") else MAX_BYTES
ALLOWED_SUFFIXES = (".csv", ".xlsx", ".json", ".jsonl", ".ndjson")


async def read_upload(file: UploadFile) -> tuple[bytes, str]:
    """Read an upload. A text file may arrive gzip-compressed (name.csv.gz) so larger files fit the hosting request limit."""
    name = file.filename or ""
    gzipped = name.lower().endswith(".gz")
    base = name[:-3] if gzipped else name
    if not base.lower().endswith(ALLOWED_SUFFIXES) or (gzipped and base.lower().endswith(".xlsx")):
        raise HTTPException(400, "Please upload a .csv, .xlsx or .json file.")
    content = await file.read(UPLOAD_LIMIT + 1)
    if len(content) > UPLOAD_LIMIT:
        raise HTTPException(413, f"CSV exceeds the {UPLOAD_LIMIT // (1024 * 1024)} MB limit.")
    if gzipped:
        inflater = zlib.decompressobj(wbits=31)
        try:
            content = inflater.decompress(content, MAX_BYTES + 1)
        except zlib.error as exc:
            raise HTTPException(400, "The compressed file could not be read.") from exc
        if len(content) > MAX_BYTES or inflater.unconsumed_tail:
            raise HTTPException(413, f"The file exceeds the {MAX_BYTES // (1024 * 1024)} MB limit.")
    return content, base


def parse_schema(raw: str | None) -> dict:
    try:
        config = json.loads(raw) if raw else {}
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "Schema configuration is not valid JSON.") from exc
    if not isinstance(config, dict):
        raise HTTPException(400, "Schema configuration must be an object.")
    attested = config.get("authorized_to_process", False)
    if not isinstance(attested, bool):
        raise HTTPException(400, "Authorization attestation must be true or false.")
    if is_hosted() and not attested:
        raise HTTPException(400, "Authorization for this non-personal file must be attested before analysis.")
    return config


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
        content, filename = await read_upload(file)
        schema_config = parse_schema(schema_config_json)
        result = await run_in_threadpool(
            analyze,
            content,
            filename,
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


@app.post("/api/redact")
async def redact(
    file: UploadFile,
    header_mode: str = Query("auto", pattern="^(auto|present|absent)$"),
    schema_config_json: str | None = Form(None, alias="schema"),
):
    """Return the file as CSV without the chosen columns (for example personal-data columns). Nothing is stored."""
    try:
        content, filename = await read_upload(file)
        schema_config = parse_schema(schema_config_json)
        text = await run_in_threadpool(
            redact_columns,
            content,
            filename,
            schema_config.get("drop_columns"),
            header_mode,
            schema_config.get("sheet"),
            schema_config.get("header_row"),
        )
        return Response(text.encode("utf-8-sig"), media_type="text/csv; charset=utf-8")
    except (TypeError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        await file.close()
