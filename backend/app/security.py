import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class UserContext:
    id: str
    email: str | None
    role: str


def auth_required() -> bool:
    return os.environ.get("DATALENS_AUTH_REQUIRED", "false").lower() == "true"


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> UserContext:
    if not auth_required():
        return UserContext(id="local-development", email=None, role="developer")
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Authentication is required.", headers={"WWW-Authenticate": "Bearer"})
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    anon_key = os.environ.get("SUPABASE_ANON_KEY", "")
    if not url or not anon_key:
        raise HTTPException(503, "Authentication service is not configured.")
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                f"{url}/auth/v1/user",
                headers={"apikey": anon_key, "Authorization": f"Bearer {credentials.credentials}"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(503, "Authentication service is temporarily unavailable.") from exc
    if response.status_code != 200:
        raise HTTPException(401, "Your session is invalid or expired.", headers={"WWW-Authenticate": "Bearer"})
    payload = response.json()
    role = str(payload.get("app_metadata", {}).get("role") or "authenticated")
    allowed = {item.strip() for item in os.environ.get("DATALENS_ALLOWED_ROLES", "authenticated").split(",")}
    if role not in allowed:
        raise HTTPException(403, "Your account is not authorized for DataLens.")
    return UserContext(id=str(payload["id"]), email=payload.get("email"), role=role)


def sign_audit_event(event: dict) -> dict:
    secret = os.environ.get("DATALENS_AUDIT_SECRET")
    if not secret:
        if auth_required():
            raise HTTPException(503, "Audit signing is not configured.")
        secret = "local-development-only"
    canonical = json.dumps(event, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    signature = hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    return {**event, "signature": signature, "signature_algorithm": "HMAC-SHA256"}


def new_audit_event(action: str, actor: UserContext, analysis_id: str, details: dict | None = None) -> dict:
    return sign_audit_event(
        {
            "event_version": 1,
            "action": action,
            "actor_id": actor.id,
            "actor_email": actor.email,
            "actor_role": actor.role,
            "analysis_id": analysis_id,
            "timestamp": int(time.time()),
            "details": details or {},
        }
    )
