import secrets
import time
from fastapi import HTTPException, Header

import pyotp

from backend.config import settings

# In-memory session store (resets when server restarts)
_sessions: dict[str, dict] = {}

# Short-lived tokens for users who passed step 1 but still need TOTP
_pending_totp: dict[str, dict] = {}
PENDING_TOTP_TTL = 300  # 5 minutes to enter the code


def login(username: str, password: str) -> dict:
    """Step 1: validate username + password.

    Returns {"token": "..."} if no TOTP is configured, or
    {"requires_totp": True, "partial_token": "..."} if TOTP is needed.
    """
    if not settings.dashboard_username:
        raise HTTPException(status_code=500, detail="No dashboard username configured")
    if not settings.dashboard_password:
        raise HTTPException(status_code=500, detail="No dashboard password configured")

    # Check username (constant-time comparison to avoid timing leaks)
    if not secrets.compare_digest(username, settings.dashboard_username):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Check password
    if not secrets.compare_digest(password, settings.dashboard_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # If TOTP is configured, don't give a full session yet
    if settings.totp_secret:
        partial = secrets.token_urlsafe(32)
        _pending_totp[partial] = {"created": time.time()}
        return {"requires_totp": True, "partial_token": partial}

    # No TOTP — issue a full session token
    return {"token": _create_session()}


def verify_totp(partial_token: str, totp_code: str) -> str:
    """Step 2: validate TOTP code using a partial token from step 1.

    Returns a full session token on success.
    """
    # Check the partial token exists and hasn't expired
    pending = _pending_totp.pop(partial_token, None)
    if not pending:
        raise HTTPException(status_code=401, detail="Invalid or expired session, please log in again")
    if time.time() - pending["created"] > PENDING_TOTP_TTL:
        raise HTTPException(status_code=401, detail="2FA timed out, please log in again")

    # Validate the TOTP code
    totp = pyotp.TOTP(settings.totp_secret)
    if not totp_code or not totp.verify(totp_code, valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid 2FA code")

    return _create_session()


def _create_session() -> str:
    """Create a new session token and store it."""
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
