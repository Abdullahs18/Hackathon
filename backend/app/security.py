from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import get_session
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
