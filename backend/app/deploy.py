"""Render startup: verify configuration/storage, migrate, seed deliberately, run one worker."""

import logging
import os
import sys
from pathlib import Path

import uvicorn
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.cloud_storage import make_store
from app.config import Settings
from app.db import Base, make_engine


def secure_tables(connection):
    """Supabase's Data API must not bypass Dastak's own case/consent authorization."""
    if connection.dialect.name != "postgresql":
        return
    quote = connection.dialect.identifier_preparer.quote
    for name in [*Base.metadata.tables, "alembic_version"]:
        connection.execute(text("ALTER TABLE " + quote(name) + " ENABLE ROW LEVEL SECURITY"))
    connection.commit()


def bootstrap(settings, *, seed_demo=False):
    store = make_store(settings)
    try:
        store.check()
    finally:
        close = getattr(store, "close", None)
        if close:
            close()
    if seed_demo and settings.demo_password is None:
        raise ValueError("Demo seeding requires a configured password")
    engine = make_engine(settings.database_url, pool_size=1, max_overflow=0)
    try:
        with engine.connect() as connection:
            postgres = connection.dialect.name == "postgresql"
            if postgres:
                connection.execute(text("SET lock_timeout = '60s'"))
                connection.execute(text("SELECT pg_advisory_lock(742019826)"))
                connection.commit()
            try:
                command.upgrade(
                    Config(str(Path(__file__).resolve().parents[1] / "alembic.ini")), "head"
                )
                if settings.environment == "production":
                    secure_tables(connection)
                if seed_demo:
                    from app.mock_services import seed_mock_services
                    from app.routing import seed_demo_routing
                    from app.seed import seed

                    with Session(bind=connection) as session, session.begin():
                        seed(session, settings.demo_password.get_secret_value())
                        seed_demo_routing(session)
                        seed_mock_services(session)
            finally:
                if postgres:
                    connection.rollback()
                    connection.execute(text("SELECT pg_advisory_unlock(742019826)"))
                    connection.commit()
    finally:
        engine.dispose()


def main():
    try:
        settings = Settings()
        port = int(os.environ.get("PORT", "8000"))
        if not 1024 <= port <= 65535:
            raise ValueError("Invalid HTTP port")
        bootstrap(settings, seed_demo=os.environ.get("DASTAK_SEED_DEMO", "false").lower() == "true")
    except Exception:
        # Do not print validation values, SQL connection strings, or storage credentials.
        print(
            "Deployment startup failed. Check configuration, private storage and database access.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
    logging.info("Deployment prerequisites completed; starting a single API worker.")
    uvicorn.run(
        "app.main:create_app",
        factory=True,
        host="0.0.0.0",
        port=port,
        workers=1,
        access_log=False,
        proxy_headers=bool(settings.trusted_proxy_ips),
        forwarded_allow_ips=settings.trusted_proxy_ips,
    )


if __name__ == "__main__":
    main()
