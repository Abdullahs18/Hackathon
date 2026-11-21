"""Non-destructive synthetic fixtures: python -m app.seed."""

from sqlalchemy.orm import Session

from app.config import Settings
from app.db import make_engine
from app.models import User, Workspace
from app.security import password_hasher

WORKSPACES = {
    "mock-financial-fraud": "Mock Financial Fraud Intake",
    "mock-digital-safety": "Mock Digital Safety Intake",
}
ACCOUNTS = [
    ("demo-citizen-1", "Citizen", None),
    ("demo-citizen-2", "Citizen", None),
    ("demo-helper", "Helper", None),
    ("demo-officer-financial", "Officer", "mock-financial-fraud"),
    ("demo-officer-digital", "Officer", "mock-digital-safety"),
    ("demo-admin", "Admin", None),
]


def seed(session: Session, password: str) -> None:
    if not 12 <= len(password) <= 1024:
        raise ValueError("Demo password must contain between 12 and 1024 characters")
    for workspace_id, name in WORKSPACES.items():
        if session.get(Workspace, workspace_id) is None:
            session.add(Workspace(workspace_id=workspace_id, name=name))
    session.flush()
    for user_id, role, workspace_id in ACCOUNTS:
        existing = session.get(User, user_id)
        if existing:
            if (existing.role, existing.workspace_id) != (role, workspace_id):
                raise ValueError(f"Seed account conflicts with existing data: {user_id}")
            continue
        session.add(
            User(
                user_id=user_id,
                role=role,
                workspace_id=workspace_id,
                password_hash=password_hasher.hash(password),
                active=True,
            )
        )
    session.flush()


def main() -> None:
    settings = Settings()
    if settings.demo_password is None:
        raise ValueError("Set DASTAK_DEMO_PASSWORD to seed synthetic demo accounts")
    engine = make_engine(settings.database_url)
    try:
        with Session(engine) as session, session.begin():
            seed(session, settings.demo_password.get_secret_value())
            from app.routing import seed_demo_routing

            seed_demo_routing(session)
            from app.mock_services import seed_mock_services

            seed_mock_services(session)
        print("Synthetic demo fixtures are ready; existing passwords were preserved.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
