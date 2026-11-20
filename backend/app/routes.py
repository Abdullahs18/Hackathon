from collections import OrderedDict
from threading import Lock
from time import monotonic

from fastapi import APIRouter, HTTPException, Request
from pwdlib.exceptions import UnknownHashError
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.audit import record_event
from app.db import expected_database_heads
from app.models import User, Workspace
from app.schemas import Health, Login, LoginResult, UserCreate, UserView
from app.security import (
    AdminUser,
    CurrentUser,
    SessionDep,
    issue_token,
    password_hasher,
    unauthorized,
)

router = APIRouter(prefix="/api/v1")


class LoginLimiter:
    """Bounded, process-local protection. Run one worker in the prototype."""

    def __init__(self, limit: int):
        self.limit = limit
        self.buckets: OrderedDict[str, list[float]] = OrderedDict()
        self.lock = Lock()

    def check(self, key: str) -> None:
        now = monotonic()
        with self.lock:
            recent = [t for t in self.buckets.pop(key, []) if now - t < 60]
            self.buckets[key] = recent
            if len(self.buckets) > 10000:
                self.buckets.popitem(last=False)
            if len(recent) >= self.limit:
                raise HTTPException(
                    429, "Too many login attempts. Try again later.", {"Retry-After": "60"}
                )
            recent.append(now)


@router.get("/health", response_model=Health, tags=["Health"], operation_id="getHealth")
def health():
    return {"status": "ok", "simulated": True}


@router.get("/health/ready", response_model=Health, tags=["Health"], operation_id="getReadiness")
def ready(session: SessionDep):
    try:
        revisions = set(session.scalars(text("SELECT version_num FROM alembic_version")))
        if revisions != expected_database_heads():
            raise HTTPException(503, "Database migrations are not current.")
        session.execute(text("SELECT user_id FROM users LIMIT 1"))
    except SQLAlchemyError:
        raise HTTPException(503, "Database or migrations are unavailable.") from None
    return {"status": "ok", "simulated": True}


@router.post(
    "/auth/login", response_model=LoginResult, tags=["Authentication"], operation_id="login"
)
def login(body: Login, request: Request, session: SessionDep):
    request.app.state.login_limiter.check(request.client.host if request.client else "unknown")
    user = session.get(User, body.user_id)
    encoded = user.password_hash if user else request.app.state.dummy_password_hash
    try:
        valid = password_hasher.verify(body.password, encoded)
    except UnknownHashError:
        valid = False
    if not valid or user is None or not user.active:
        record_event(session, "auth.login_denied", None, "Invalid credentials")
        session.commit()
        raise unauthorized()
    token = issue_token(user.user_id, request.app.state.settings)
    record_event(session, "auth.login", user.user_id, "Authenticated")
    session.commit()
    return {"access_token": token}


@router.get("/auth/me", response_model=UserView, tags=["Authentication"], operation_id="getMe")
def me(user: CurrentUser):
    return UserView(user_id=user.user_id, role=user.role, workspace_id=user.workspace_id)


@router.get("/admin/users", response_model=list[UserView], tags=["Admin"], operation_id="listUsers")
def list_users(admin: AdminUser, session: SessionDep):
    return [
        UserView(user_id=u.user_id, role=u.role, workspace_id=u.workspace_id)
        for u in session.scalars(select(User).order_by(User.user_id))
    ]


@router.post(
    "/admin/users",
    response_model=UserView,
    status_code=201,
    tags=["Admin"],
    operation_id="createUser",
)
def create_user(body: UserCreate, admin: AdminUser, session: SessionDep):
    if body.role == "Officer" and body.workspace_id is None:
        raise HTTPException(400, "Officers require a workspace.")
    if body.workspace_id is not None and session.get(Workspace, body.workspace_id) is None:
        raise HTTPException(400, "Workspace does not exist.")
    user = User(
        user_id=body.user_id,
        password_hash=password_hasher.hash(body.password),
        role=body.role,
        workspace_id=body.workspace_id,
        active=True,
    )
    session.add(user)
    try:
        session.flush()
        record_event(session, "admin.user_created", admin.user_id, "Created a synthetic account")
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Account already exists or conflicts with current data.") from None
    return UserView(user_id=user.user_id, role=user.role, workspace_id=user.workspace_id)
