"""Disposable localhost browser-test server. Synthetic providers; never use application data."""

import os
import subprocess
import tempfile
from pathlib import Path
from uuid import uuid4

import imageio_ffmpeg
import uvicorn
from alembic import command
from alembic.config import Config
from sqlalchemy.orm import Session

from app.config import Settings
from app.main import create_app
from app.mock_services import seed_mock_services
from app.routing import seed_demo_routing
from app.seed import seed
from tests.test_analysis import FakeProvider
from tests.test_case_voice import Speaker, VoiceProvider


def main():
    with tempfile.TemporaryDirectory(prefix="dastak-browser-") as directory:
        root = Path(directory)
        # Isolated storage is created for this process and discarded on exit.
        os.environ["DASTAK_DATABASE_URL"] = "sqlite:///" + (root / "test.db").as_posix()
        os.environ["DASTAK_JWT_SECRET"] = "browser-test-only-secret-with-at-least-32-characters"
        command.upgrade(Config("alembic.ini"), "head")
        app = create_app(
            Settings(
                _env_file=None,
                evidence_dir=root / "evidence",
                login_attempts_per_minute=100,
                cors_origins=["http://127.0.0.1:5174", "http://localhost:5174"],
            )
        )
        with Session(app.state.engine) as session, session.begin():
            seed(session, "synthetic-test-password")
            seed_demo_routing(session)
            seed_mock_services(session)
        speaker = Speaker()
        encoded = subprocess.run(
            [
                imageio_ffmpeg.get_ffmpeg_exe(),
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=r=16000:cl=mono",
                "-t",
                "1",
                "-f",
                "mp3",
                "pipe:1",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=15,
            check=True,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        speaker.data = encoded.stdout

        def assessment_provider():
            provider = FakeProvider()
            provider.output["classification"]["missing_fields"] = []
            return provider

        def voice_provider():
            provider = VoiceProvider()
            provider.output["incident_data"]["description"] += " Synthetic run " + uuid4().hex
            return provider

        app.state.analysis_provider_factory = assessment_provider
        app.state.voice_provider_factory = voice_provider
        app.state.voice_speaker_factory = lambda: speaker
        uvicorn.run(app, host="127.0.0.1", port=8011, access_log=False, proxy_headers=False)


if __name__ == "__main__":
    main()
