from collections.abc import Iterator
from functools import lru_cache
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import Request
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session


class Base(DeclarativeBase):
    pass


@lru_cache
def expected_database_heads() -> set[str]:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    return set(ScriptDirectory.from_config(config).get_heads())


def make_engine(url: str, *, pool_size: int = 5, max_overflow: int = 10) -> Engine:
    kwargs = {
        "connect_args": (
            {"check_same_thread": False}
            if url.startswith("sqlite")
            else {"connect_timeout": 5, "prepare_threshold": None}
        )
    }
    if not url.startswith("sqlite"):
        kwargs.update(pool_size=pool_size, max_overflow=max_overflow)
    engine = create_engine(url, pool_pre_ping=True, **kwargs)
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")

    return engine


def get_session(request: Request) -> Iterator[Session]:
    with Session(request.app.state.engine) as session:
        yield session
