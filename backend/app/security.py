import hashlib
import hmac
import json
import os
import time

from fastapi import HTTPException


def is_hosted() -> bool:
    """True on Vercel, where unsafe development defaults must fail closed."""
    return bool(os.environ.get("VERCEL"))


def sign_audit_event(event: dict) -> dict:
    secret = os.environ.get("DATALENS_AUDIT_SECRET")
    if not secret:
        if is_hosted():
            raise HTTPException(503, "Audit signing is not configured.")
        secret = "local-development-only"
    canonical = json.dumps(event, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    signature = hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    return {**event, "signature": signature, "signature_algorithm": "HMAC-SHA256"}


def verify_audit_event(event: dict) -> dict:
    if not isinstance(event, dict) or len(json.dumps(event, ensure_ascii=False)) > 8_192:
        raise HTTPException(400, "The signed event is missing or too large.")
    if event.get("signature_algorithm") != "HMAC-SHA256" or not isinstance(event.get("signature"), str):
        raise HTTPException(400, "The signed event format is invalid.")
    unsigned = {key: value for key, value in event.items() if key not in {"signature", "signature_algorithm"}}
    expected = sign_audit_event(unsigned)["signature"]
    if not hmac.compare_digest(event["signature"], expected):
        raise HTTPException(400, "The signed event could not be verified.")
    return event


def new_audit_event(action: str, analysis_id: str, details: dict | None = None) -> dict:
    # Nobody signs in, so events record what happened and when, not who did it.
    return sign_audit_event(
        {
            "event_version": 2,
            "action": action,
            "analysis_id": analysis_id,
            "timestamp": int(time.time()),
            "details": details or {},
        }
    )
