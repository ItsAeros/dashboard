import secrets
import time
from fastapi import HTTPException, Header

from backend.config import settings

# In-memory session store (resets when server restarts)
_sessions: dict[str, dict] = {}


def login(password: str) -> str:
    """Validate password and return a session token."""
    if not settings.dashboard_password:
        raise HTTPException(status_code=500, detail="No dashboard password configured")
    if not secrets.compare_digest(password, settings.dashboard_password):
        raise HTTPException(status_code=401, detail="Wrong password")
    token = secrets.token_urlsafe(32)
    _sessions[token] = {"created": time.time()}
    return token


def require_auth(authorization: str = Header(None)):
    """FastAPI dependency — rejects requests without a valid token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    if token not in _sessions:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
