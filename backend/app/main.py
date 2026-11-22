import logging
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.admin_assignment_routes import router as admin_assignment_router
from app.admin_trace_routes import router as admin_trace_router
from app.agent_progress_routes import router as agent_progress_router
from app.analysis_routes import AnalysisGuard, provider_factory
from app.analysis_routes import router as analysis_router
from app.api_key_routes import router as api_key_router
from app.case_routes import router as case_router
from app.case_voice_routes import router as case_voice_router
from app.config import Settings
from app.contracts import implemented_openapi
from app.db import make_engine
from app.errors import install_error_handlers
from app.evidence_body_limit import EvidenceBodyLimit
from app.evidence_routes import router as evidence_router
from app.evidence_storage import EvidenceStore
from app.evidence_validation import EvidenceValidator
from app.notification_routes import router as notification_router
from app.review_help_routes import router as review_help_router
from app.review_routes import router as review_router
from app.routes import LoginLimiter, router
from app.routing_routes import router as routing_router
from app.security import password_hasher
from app.submission_routes import router as submission_router
from app.voice.providers import GTTSSpeaker


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
    app.state.analysis_guard = AnalysisGuard()
    app.state.analysis_provider_factory = provider_factory
    app.state.voice_provider_factory = provider_factory
    app.state.speech_translation_provider_factory = provider_factory
    app.state.voice_speaker_factory = GTTSSpeaker
    app.state.evidence_store = EvidenceStore(settings.evidence_dir)
    app.state.evidence_validator = EvidenceValidator()
    app.add_middleware(EvidenceBodyLimit, max_bytes=settings.evidence_max_bytes)
    app.state.login_limiter = LoginLimiter(settings.login_attempts_per_minute)
    app.state.dummy_password_hash = password_hasher.hash(str(uuid4()))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key", "Idempotency-Key", "If-Match"],
        expose_headers=[
            "ETag",
            "X-Request-ID",
            "Content-Disposition",
            "X-Complaint-Version",
            "X-Evidence-SHA256",
            "X-Evidence-Verification",
            "X-Next-Cursor",
        ],
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
    app.include_router(evidence_router)
    app.include_router(analysis_router)
    app.include_router(routing_router)
    app.include_router(submission_router)
    app.include_router(review_router)
    app.include_router(notification_router)
    app.include_router(api_key_router)
    app.include_router(admin_trace_router)
    app.include_router(admin_assignment_router)
    app.include_router(agent_progress_router)
    app.include_router(review_help_router)
    app.include_router(case_voice_router)

    def openapi():
        if app.openapi_schema is None:
            app.openapi_schema = implemented_openapi(
                [
                    *router.routes,
                    *case_router.routes,
                    *evidence_router.routes,
                    *analysis_router.routes,
                    *routing_router.routes,
                    *submission_router.routes,
                    *review_router.routes,
                    *notification_router.routes,
                    *api_key_router.routes,
                    *admin_trace_router.routes,
                    *admin_assignment_router.routes,
                    *agent_progress_router.routes,
                    *review_help_router.routes,
                    *case_voice_router.routes,
                ]
            )
        return app.openapi_schema

    app.openapi = openapi
    return app
