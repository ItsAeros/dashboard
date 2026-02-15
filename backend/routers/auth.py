from fastapi import APIRouter
from pydantic import BaseModel

from backend.auth import login, verify_totp

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class TotpRequest(BaseModel):
    partial_token: str
    totp_code: str


@router.post("/auth/login")
def do_login(body: LoginRequest):
    """Step 1: validate username + password.

    Returns {"token": "..."} or {"requires_totp": true, "partial_token": "..."}.
    """
    return login(body.username, body.password)


@router.post("/auth/verify-totp")
def do_verify_totp(body: TotpRequest):
    """Step 2: validate TOTP code. Returns {"token": "..."}."""
    token = verify_totp(body.partial_token, body.totp_code)
    return {"token": token}
