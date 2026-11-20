import hashlib
import hmac
import os
import re
import tempfile
from pathlib import Path

from fastapi import HTTPException


class EvidenceStore:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def check(self) -> None:
        try:
            self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
            with tempfile.TemporaryFile(dir=self.root) as probe:
                probe.write(b"1")
        except OSError:
            raise HTTPException(503, "Private evidence storage is unavailable.") from None

    def path(self, key: str) -> Path:
        if re.fullmatch(r"[a-f0-9]{32}\.blob", key) is None:
            raise HTTPException(503, "Private evidence storage is unavailable.")
        path = self.root / key
        if path.is_symlink() or path.resolve().parent != self.root:
            raise HTTPException(503, "Private evidence storage is unavailable.")
        return path

    def write(self, key: str, data: bytes) -> None:
        self.check()
        path = self.path(key)
        created = False
        try:
            with path.open("xb") as output:
                created = True
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
        except OSError:
            if created:
                self.remove(key)
            raise HTTPException(503, "Private evidence storage is unavailable.") from None

    def read(self, key: str, size: int, digest: str) -> bytes:
        try:
            with self.path(key).open("rb") as source:
                data = source.read(size + 1)
        except OSError:
            raise HTTPException(503, "Private evidence storage is unavailable.") from None
        if len(data) != size or not hmac.compare_digest(hashlib.sha256(data).hexdigest(), digest):
            raise HTTPException(503, "Stored evidence failed its size or integrity check.")
        return data

    def remove(self, key: str) -> None:
        try:
            self.path(key).unlink(missing_ok=True)
        except OSError:
            # Cleanup failure must not leak a private path or hide the original failure.
            pass
