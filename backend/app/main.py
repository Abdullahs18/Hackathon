import logging
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.case_routes import router as case_router
from app.config import Settings
from app.contracts import implemented_openapi
from app.db import make_engine
from app.errors import install_error_handlers
from app.routes import LoginLimiter, router
from app.security import password_hasher


def create_app(settings: Settings | None = None) -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = settings or Settings()
    engine = make_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        engine.dispose()

    app = FastAPI(
        title="Dastak REST API — implemented backend",
        version="0.1.0",
        lifespan=lifespan,
        description="Synthetic demo only. Implemented routes shown; contracts/ is canonical.",
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.login_limiter = LoginLimiter(settings.login_attempts_per_minute)
    app.state.dummy_password_hash = password_hasher.hash(str(uuid4()))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key", "Idempotency-Key", "If-Match"],
        expose_headers=["ETag", "X-Request-ID"],
    )
    install_error_handlers(app)

    @app.middleware("http")
    async def request_metadata(request: Request, call_next):
        request_id = str(uuid4())
        try:
            response = await call_next(request)
        except Exception:
            # Don't let server traceback logs expose SQL parameters or provider payloads.
            response = JSONResponse(
                status_code=500,
                content={"error": "internal_error", "detail": "An unexpected error occurred."},
            )
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        # Never log URLs, bodies, credentials, query strings or evidence metadata.
        logging.getLogger("dastak.requests").info(
            "request_id=%s method=%s status=%s", request_id, request.method, response.status_code
        )
        return response

    app.include_router(router)
    app.include_router(case_router)

    def openapi():
        if app.openapi_schema is None:
            app.openapi_schema = implemented_openapi([*router.routes, *case_router.routes])
        return app.openapi_schema

    app.openapi = openapi
    return app
