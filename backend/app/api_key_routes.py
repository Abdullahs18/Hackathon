import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.audit import record_event
from app.case_policy import timestamp
from app.key_policy import ROLE_SCOPES
from app.models import ApiKey
from app.pagination import page
from app.security import AdminUser, CurrentUser, SessionDep
from app.submission_policy import digest
from app.validation import validate_payload

router = APIRouter(prefix="/api/v1")
CreationKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]
PageLimit = Annotated[int, Query(ge=1, le=100)]


def metadata(row):
    return {
        "api_key_id": row.api_key_id,
        "scopes": row.scopes,
        "expires_at": timestamp(row.expires_at),
        "revoked": row.revoked,
        "created_at": timestamp(row.created_at),
        "revoked_at": timestamp(row.revoked_at) if row.revoked_at else None,
    }


def key_page(session, response, before, limit, principal_id=None):
    statement = select(
        ApiKey.api_key_id,
        ApiKey.scopes,
        ApiKey.expires_at,
        ApiKey.revoked,
        ApiKey.created_at,
        ApiKey.revoked_at,
    )
    if principal_id is not None:
        statement = statement.where(ApiKey.principal_id == principal_id)
    rows = page(
        session,
        statement,
        ApiKey,
        ApiKey.api_key_id,
        ApiKey.created_at,
        before,
        limit,
        response,
        principal_id=principal_id,
    )
    return [metadata(row) for row in rows]


def jwt_only(request):
    if getattr(request.state, "api_key_id", None) is not None:
        raise HTTPException(403, "Self-service credential management requires a JWT.")


def issue(body, request, principal, session, idempotency_key):
    jwt_only(request)
    validate_payload("ApiKeyCreate", body)
    principal_id = principal.user_id
    scopes = sorted(body["scopes"])
    if not set(scopes) <= ROLE_SCOPES.get(principal.role, set()):
        raise HTTPException(400, "Requested scopes exceed your current account role.")
    try:
        expires = datetime.fromisoformat(body["expires_at"])
        if "T" not in body["expires_at"] or expires.tzinfo is None or expires.utcoffset() is None:
            raise ValueError
        expires = expires.astimezone(UTC)
    except (ValueError, TypeError, OverflowError):
        raise HTTPException(400, "Expiry must be a timezone-aware date-time.") from None
    now = datetime.now(UTC)
    if not now < expires <= now + timedelta(days=90):
        raise HTTPException(400, "Expiry must be in the future and no more than 90 days away.")
    fingerprint = digest(
        {"principal_id": principal_id, "scopes": scopes, "expires_at": expires.isoformat()}
    )
    previous = session.scalar(
        select(ApiKey).where(
            ApiKey.issued_by == principal_id, ApiKey.create_idempotency_key == idempotency_key
        )
    )
    if previous is not None:
        raise HTTPException(
            409,
            "Creation command already used. Recover metadata; revoke if the secret was lost.",
        )
    identity = uuid4()
    secret = "dastak_" + identity.hex + "." + secrets.token_urlsafe(32)
    row = ApiKey(
        api_key_id=str(identity),
        principal_id=principal_id,
        issued_by=principal_id,
        key_hash=hashlib.sha256(secret.encode()).hexdigest(),
        scopes=scopes,
        created_at=now,
        expires_at=expires,
        revoked=False,
        revoked_at=None,
        create_idempotency_key=idempotency_key,
        create_fingerprint=fingerprint,
    )
    session.add(row)
    record_event(
        session,
        "api_key.created",
        principal_id,
        "A scoped credential was issued; secret omitted from audit",
        details={"api_key_id": row.api_key_id, "scopes": scopes},
    )
    result = {**metadata(row), "api_key": secret}
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Creation command conflicts with an existing key.") from None
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(
            503,
            "Issuance is uncertain. Recover metadata and revoke orphaned keys.",
        ) from None
    return result


def revoke(id, actor, session, owner_only=False):
    query = select(ApiKey).where(ApiKey.api_key_id == id)
    if owner_only:
        query = query.where(ApiKey.principal_id == actor.user_id)
    row = session.scalar(query.with_for_update().execution_options(populate_existing=True))
    if row is None:
        raise HTTPException(404, "API key does not exist.")
    if not row.revoked:
        row.revoked = True
        row.revoked_at = datetime.now(UTC)
        record_event(
            session,
            "api_key.revoked",
            actor.user_id,
            "An API key was revoked",
            details={"api_key_id": id},
        )
    result = metadata(row)
    try:
        session.commit()
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(
            503, "Revocation outcome is uncertain. Recover key metadata and retry."
        ) from None
    return result


@router.get("/admin/api-keys", operation_id="listApiKeys", tags=["Admin"])
def list_keys(
    response: Response,
    admin: AdminUser,
    session: SessionDep,
    before: UUID | None = None,
    limit: PageLimit = 50,
):
    return key_page(session, response, before, limit)


@router.post("/admin/api-keys", operation_id="createApiKey", tags=["Admin"], status_code=201)
def create_key(
    body: dict,
    request: Request,
    admin: AdminUser,
    session: SessionDep,
    idempotency_key: CreationKey,
):
    return issue(body, request, admin, session, idempotency_key)


@router.post("/admin/api-keys/{id}/revoke", operation_id="revokeApiKey", tags=["Admin"])
def revoke_key(id: str, admin: AdminUser, session: SessionDep):
    return revoke(id, admin, session)


@router.get("/api-keys", operation_id="listOwnApiKeys", tags=["Authentication"])
def list_own_keys(
    request: Request,
    response: Response,
    user: CurrentUser,
    session: SessionDep,
    before: UUID | None = None,
    limit: PageLimit = 50,
):
    jwt_only(request)
    return key_page(session, response, before, limit, user.user_id)


@router.post("/api-keys", operation_id="createOwnApiKey", tags=["Authentication"], status_code=201)
def create_own_key(
    body: dict,
    request: Request,
    user: CurrentUser,
    session: SessionDep,
    idempotency_key: CreationKey,
):
    return issue(body, request, user, session, idempotency_key)


@router.post("/api-keys/{id}/revoke", operation_id="revokeOwnApiKey", tags=["Authentication"])
def revoke_own_key(id: str, request: Request, user: CurrentUser, session: SessionDep):
    jwt_only(request)
    return revoke(id, user, session, owner_only=True)
