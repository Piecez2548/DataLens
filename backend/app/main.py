import os

from fastapi import FastAPI, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from .analysis import MAX_BYTES, analyze

UPLOAD_LIMIT = 4 * 1024 * 1024 if os.environ.get("VERCEL") else MAX_BYTES

app = FastAPI(title="DataLens API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/analyze")
async def upload(file: UploadFile, header_mode: str = Query("auto", pattern="^(auto|present|absent)$")):
    try:
        if not (file.filename or "").lower().endswith(".csv"):
            raise HTTPException(400, "Please upload a .csv file.")
        content = await file.read(UPLOAD_LIMIT + 1)
        if len(content) > UPLOAD_LIMIT:
            raise HTTPException(413, f"CSV exceeds the {UPLOAD_LIMIT // (1024 * 1024)} MB limit.")
        return await run_in_threadpool(analyze, content, file.filename, header_mode)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        await file.close()
