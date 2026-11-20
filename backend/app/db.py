from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> Engine:
    kwargs = {
        "connect_args": (
            {"check_same_thread": False} if url.startswith("sqlite") else {"connect_timeout": 5}
        )
    }
    engine = create_engine(url, pool_pre_ping=True, **kwargs)
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")

    return engine


def get_session(request: Request) -> Iterator[Session]:
    with Session(request.app.state.engine) as session:
        yield session
