import logging
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.exceptions import HTTPException

from server.files import FileStore, FileTooLarge
from server.limits import RequestLimitMiddleware
from server.schemas import ClipRequest, ImageRequest, MattingRequest, TranscribeRequest, TtsRequest
from server.schemas import ClipResult, ErrorResponse, FileRecord, ImageResult, MattingResult, SpeechResult, TranscriptionResult
from server.services import MediaServices
from tools.runtime import ModelUnavailable

logger = logging.getLogger(__name__)


def create_app(storage_dir=None, services=None, max_file_bytes=100 * 1024 * 1024):
    app = FastAPI(title="Fourier Tools", version="1.0.0",
                  description="Upload media, invoke a tool with its file ID, download the result.",
                  responses={status: {"model": ErrorResponse} for status in (404, 413, 422, 500, 503)})
    app.add_middleware(RequestLimitMiddleware, max_bytes=max_file_bytes + 1024 * 1024)
    store = FileStore(storage_dir or Path(__file__).resolve().parents[1] / ".data", max_file_bytes)
    service = services or MediaServices(store)
    app.state.store = store
    app.state.services = service

    def error(status, code, message, details=None):
        body = {"code": code, "message": message}
        if details is not None:
            body["details"] = details
        return JSONResponse({"error": body}, status_code=status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return error(422, "invalid_request", "Request validation failed", [
            {"location": list(row["loc"]), "message": row["msg"], "type": row["type"]}
            for row in exc.errors()
        ])

    @app.exception_handler(FileTooLarge)
    async def too_large(request, exc):
        return error(413, "file_too_large", str(exc))

    @app.exception_handler(FileNotFoundError)
    async def not_found(request, exc):
        return error(404, "file_not_found", "File not found")

    @app.exception_handler(ValueError)
    async def bad_input(request, exc):
        return error(422, "invalid_input", str(exc))

    @app.exception_handler(ModelUnavailable)
    @app.exception_handler(ImportError)
    async def unavailable(request, exc):
        logger.warning("Tool unavailable", exc_info=exc)
        return error(503, "model_unavailable", "The model or its runtime is unavailable; see server logs")

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return error(exc.status_code, "file_too_large" if exc.status_code == 413 else "http_error", str(exc.detail))

    @app.exception_handler(Exception)
    async def internal_error(request, exc):
        logger.exception("Tool failed", exc_info=exc)
        return error(500, "processing_failed", "Media processing failed; see server logs")

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "fourier-tools"}

    @app.get("/v1/tools")
    def capabilities():
        return {"tools": service.capabilities()}

    @app.post("/v1/files", status_code=201, response_model=FileRecord)
    def upload(file: UploadFile = File(...)):
        try:
            return store.save(file.file, file.filename)
        finally:
            file.file.close()

    @app.get("/v1/files/{file_id}", response_model=FileRecord)
    def metadata(file_id: str):
        return store.get(file_id)[0]

    @app.get("/v1/files/{file_id}/content")
    def download(file_id: str):
        info, path = store.get(file_id)
        return FileResponse(path, media_type=info["mediaType"], filename=info["name"],
                            headers={"X-Content-Type-Options": "nosniff"})

    @app.delete("/v1/files/{file_id}", status_code=204)
    def delete(file_id: str):
        store.delete(file_id)
        return Response(status_code=204)

    # Synchronous endpoints run in Starlette's worker pool, never on the event loop.
    @app.post("/v1/matting", response_model=MattingResult)
    def matting(body: MattingRequest):
        return service.matting(body)

    @app.post("/v1/scaleup", response_model=ImageResult)
    def scaleup(body: ImageRequest):
        return service.scaleup(body)

    @app.post("/v1/transcribe", response_model=TranscriptionResult)
    def transcribe(body: TranscribeRequest):
        return service.transcribe(body)

    @app.post("/v1/clip", response_model=ClipResult)
    def clip(body: ClipRequest):
        return service.match(body)

    @app.post("/v1/tts", response_model=SpeechResult)
    def tts(body: TtsRequest):
        return service.tts(body)

    return app
