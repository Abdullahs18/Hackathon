import json
import os
import subprocess
import sys
from pathlib import Path
from threading import BoundedSemaphore

from fastapi import HTTPException


class EvidenceValidator:
    def __init__(self):
        self.capacity = BoundedSemaphore(2)

    def validate(
        self, data: bytes, filename: str | None, declared_type: str | None
    ) -> tuple[str, str]:
        name = (filename or "").replace("\\", "/").rsplit("/", 1)[-1]
        if not name or len(name) > 200 or any(ord(char) < 32 or ord(char) == 127 for char in name):
            raise HTTPException(400, "Provide a valid evidence filename.")
        extensions = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".pdf": "application/pdf",
        }
        expected = extensions.get(Path(name).suffix.lower())
        if expected is None:
            raise HTTPException(400, "Use a PNG, JPEG, WebP or static PDF file.")
        if not self.capacity.acquire(blocking=False):
            raise HTTPException(
                429, "Evidence validation is busy. Retry shortly.", {"Retry-After": "1"}
            )
        try:
            # Keep credentials and open application descriptors out of the parser process.
            environment = {
                key: os.environ[key]
                for key in ("PATH", "SYSTEMROOT", "WINDIR")
                if key in os.environ
            }
            environment.update(PYTHONIOENCODING="utf-8", PYTHONDONTWRITEBYTECODE="1")
            result = subprocess.run(
                [sys.executable, "-m", "app.evidence_validation_worker"],
                input=data,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=5,
                cwd=Path(__file__).resolve().parents[1],
                env=environment,
                close_fds=True,
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(400, "Evidence exceeds validation resource limits.") from None
        except OSError:
            raise HTTPException(503, "Evidence validation is unavailable.") from None
        finally:
            self.capacity.release()
        if result.returncode == 2:
            raise HTTPException(503, "Evidence validation is unavailable.")
        if result.returncode != 0:
            raise HTTPException(
                400, "Evidence is invalid, unsupported or exceeds validation limits."
            )
        try:
            kind = json.loads(result.stdout)["file_type"]
        except (ValueError, KeyError, TypeError):
            raise HTTPException(503, "Evidence validation is unavailable.") from None
        declared = (declared_type or "application/octet-stream").split(";")[0].lower().strip()
        if kind != expected or declared not in (kind, "application/octet-stream"):
            raise HTTPException(
                400, "Evidence contents do not match the filename or declared type."
            )
        return name, kind
