from fastapi import APIRouter
from pydantic import BaseModel

from backend.auth import login

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    password: str


@router.post("/auth/login")
def do_login(body: LoginRequest):
    """Log in with the dashboard password. Returns a bearer token."""
    token = login(body.password)
    return {"token": token}
