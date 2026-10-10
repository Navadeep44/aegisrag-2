"""Passwords and sessions. Passwords use PBKDF2-SHA256 (100k rounds). The JWT
carries only the user id; roles and clearance are re-read from the database on
every request so a revoked role takes effect on the next call.
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import User


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    salt, _, _ = stored.partition("$")
    return hmac.compare_digest(hash_password(password, salt), stored)


def make_token(user: User) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_minutes)
    return jwt.encode({"sub": user.id, "exp": expires}, settings.jwt_secret, algorithm="HS256")


def get_user_from_token(db: Session, token: str) -> User | None:
    """Decodes JWT and loads active user from DB. Returns None if invalid or expired."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        user = db.get(User, payload.get("sub"))
        if not user or not user.active or user.status == "deactivated":
            return None
        return user
    except Exception:
        return None


def current_user(
    authorization: str = Header(default=""), db: Session = Depends(get_db)
) -> User:
    """The token only identifies the user. Tenant, roles and clearance are
    loaded from the database on every request, so changes apply immediately
    and nothing the client sends can alter them."""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Sign in to continue.")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Session is invalid or expired. Sign in again.") from None
    user = db.get(User, payload.get("sub"))
    if not user or not user.active or user.status == "deactivated":
        raise HTTPException(401, "Account is not active.")
    if user.tenant and user.tenant.status == "suspended" and not user.is_platform_admin:
        raise HTTPException(403, "Tenant is suspended. Contact platform administrator.")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if not (user.is_admin or user.has_permission("tenant.manage") or user.has_permission("role.manage")):
        raise HTTPException(403, "Only administrators can do this.")
    return user


def require_platform_admin(user: User = Depends(current_user)) -> User:
    if not user.is_platform_admin:
        raise HTTPException(403, "Only platform super administrators can do this.")
    return user


def require_permission(perm: str):
    def dependency(user: User = Depends(current_user)) -> User:
        if not user.has_permission(perm):
            raise HTTPException(403, f"Missing required permission: {perm}")
        return user
    return dependency


def require_any_permission(*perms: str):
    def dependency(user: User = Depends(current_user)) -> User:
        if not any(user.has_permission(p) for p in perms):
            raise HTTPException(403, f"Action requires one of: {', '.join(perms)}")
        return user
    return dependency
