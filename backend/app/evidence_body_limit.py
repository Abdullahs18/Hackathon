import re

from starlette.responses import JSONResponse

from app.evidence_limits import MULTIPART_OVERHEAD


class EvidenceBodyLimit:
    """Cap the complete upload request, including chunked multipart overhead, before parsing."""

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.limit = max_bytes + MULTIPART_OVERHEAD

    async def __call__(self, scope, receive, send):
        target = (
            scope["type"] == "http"
            and scope["method"] == "POST"
            and re.fullmatch(r"/api/v1/complaints/[^/]+/evidence", scope["path"])
        )
        if not target:
            return await self.app(scope, receive, send)
        headers = dict(scope["headers"])
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            declared = self.limit + 1
        if declared > self.limit or declared < 0:
            return await self.reject(scope, receive, send)
        data = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            data.extend(message.get("body", b""))
            if len(data) > self.limit:
                return await self.reject(scope, receive, send)
            if not message.get("more_body", False):
                break
        consumed = False

        async def buffered_receive():
            nonlocal consumed
            if not consumed:
                consumed = True
                return {"type": "http.request", "body": bytes(data), "more_body": False}
            return await receive()

        return await self.app(scope, buffered_receive, send)

    @staticmethod
    async def reject(scope, receive, send):
        response = JSONResponse(
            status_code=413,
            content={
                "error": "payload_too_large",
                "detail": "Evidence upload exceeds the request size limit.",
            },
        )
        await response(scope, receive, send)
