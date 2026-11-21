import hashlib
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import get_session
from app.key_policy import active_key, require_key_scope
from app.models import User

password_hasher = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
SessionDep = Annotated[Session, Depends(get_session)]


def issue_token(user_id: str, settings: Settings) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": user_id,
            "iat": now,
            "nbf": now,
            "exp": now + timedelta(minutes=settings.access_token_minutes),
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
        },
        settings.jwt_secret.get_secret_value(),
        algorithm="HS256",
    )


def unauthorized() -> HTTPException:
    return HTTPException(401, "Valid authentication is required.", {"WWW-Authenticate": "Bearer"})


def current_user(
    request: Request,
    session: SessionDep,
    credential: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> User:
    api_key = request.headers.get("X-API-Key")
    if api_key is not None:
        if (
            request.headers.get("Authorization") is not None
            or re.fullmatch(r"dastak_[a-f0-9]{32}\.[A-Za-z0-9_-]{43}", api_key) is None
        ):
            raise unauthorized()
        key_id = str(UUID(hex=api_key[7:39]))
        row = active_key(session, key_id)
        if not secrets.compare_digest(hashlib.sha256(api_key.encode()).hexdigest(), row.key_hash):
            raise unauthorized()
        user = session.get(User, row.principal_id, populate_existing=True)
        if user is None or not user.active:
            raise unauthorized()
        require_key_scope(row, user, getattr(request.scope.get("route"), "operation_id", None))
        request.state.api_key_id = row.api_key_id
        return user
    if credential is None:
        raise unauthorized()
    settings = request.app.state.settings
    try:
        payload = jwt.decode(
            credential.credentials,
            settings.jwt_secret.get_secret_value(),
            algorithms=["HS256"],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "exp", "iat", "nbf", "iss", "aud"]},
        )
        subject = payload["sub"]
        if not isinstance(subject, str) or not subject:
            raise unauthorized()
    except jwt.InvalidTokenError:
        raise unauthorized() from None
    user = session.get(User, subject)
    if user is None or not user.active:
        raise unauthorized()
    # Role/workspace come from the current DB account, never stale token claims.
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def admin_user(user: CurrentUser) -> User:
    if user.role != "Admin":
        raise HTTPException(403, "Administrator access is required.")
    return user


AdminUser = Annotated[User, Depends(admin_user)]
