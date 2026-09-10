"""Bound request bytes while multipart parsing is still in progress."""

from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse


class RequestLimitMiddleware:
    def __init__(self, app, max_bytes):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope["headers"])
        try:
            length = int(headers.get(b"content-length", b"0"))
        except ValueError:
            length = 0
        if length > self.max_bytes:
            response = JSONResponse({"error": {"code": "file_too_large", "message": "Request exceeds the size limit"}}, status_code=413)
            return await response(scope, receive, send)
        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise HTTPException(413, "Request exceeds the size limit")
            return message

        return await self.app(scope, limited_receive, send)
