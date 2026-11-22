"""Private object storage behind the existing case authorization and integrity checks."""

import hashlib
import hmac
import re

import httpx
from fastapi import HTTPException


def unavailable():
    return HTTPException(503, "Private evidence storage is unavailable.")


class SupabaseStore:
    def __init__(self, settings, *, transport=None):
        self.bucket = settings.supabase_bucket
        key = settings.supabase_service_key.get_secret_value()
        headers = {"apikey": key}
        # Legacy service_role JWTs authenticate directly; new secret keys use the gateway.
        if not key.startswith("sb_secret_"):
            headers["Authorization"] = "Bearer " + key
        self.client = httpx.Client(
            base_url=settings.supabase_url.rstrip("/") + "/storage/v1/",
            headers=headers,
            timeout=20,
            follow_redirects=False,
            transport=transport,
            trust_env=False,
        )

    def close(self):
        self.client.close()

    def check(self):
        try:
            response = self.client.get("bucket/" + self.bucket)
            if response.status_code != 200 or response.json().get("public") is not False:
                raise unavailable()
        except (httpx.HTTPError, ValueError, AttributeError):
            raise unavailable() from None

    def object_path(self, key):
        if re.fullmatch(r"[a-f0-9]{32}\.blob", key) is None:
            raise unavailable()
        return self.bucket + "/" + key

    def write(self, key, data):
        path = self.object_path(key)
        self.check()
        try:
            response = self.client.post(
                "object/" + path,
                content=data,
                headers={"Content-Type": "application/octet-stream", "x-upsert": "false"},
            )
            if response.status_code not in {200, 201}:
                raise unavailable()
        except httpx.HTTPError:
            # An uncertain POST is not retried or deleted: it might have succeeded remotely.
            raise unavailable() from None

    def read(self, key, size, digest):
        path = self.object_path(key)
        self.check()
        try:
            with self.client.stream("GET", "object/authenticated/" + path) as response:
                if response.status_code != 200:
                    raise unavailable()
                data = bytearray()
                for chunk in response.iter_bytes(chunk_size=65536):
                    data.extend(chunk)
                    if len(data) > size:
                        break
        except httpx.HTTPError:
            raise unavailable() from None
        if len(data) != size or not hmac.compare_digest(hashlib.sha256(data).hexdigest(), digest):
            raise HTTPException(503, "Stored evidence failed its size or integrity check.")
        return bytes(data)

    def remove(self, key):
        self.object_path(key)
        try:
            self.client.request("DELETE", "object/" + self.bucket, json={"prefixes": [key]})
        except httpx.HTTPError:
            # Cleanup remains best effort, matching local storage. Never expose provider payloads.
            pass


def make_store(settings):
    if settings.storage_backend == "supabase":
        return SupabaseStore(settings)
    from app.evidence_storage import EvidenceStore

    return EvidenceStore(settings.evidence_dir)
