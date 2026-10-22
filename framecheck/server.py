import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
import shutil

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.requests import ClientDisconnect

from . import media
from .detection import SETTINGS
from .jobs import JobManager
from .media import MediaError

ROOT = Path(__file__).resolve().parent.parent
ALLOWED_HOSTS = {"127.0.0.1", "localhost"}
ALLOWED_ORIGINS = {f"http://{host}:{port}" for host in ALLOWED_HOSTS for port in (8765, 8766, 5173)}


def create_app():
    @asynccontextmanager
    async def lifespan(app):
        app.state.tools = await media.check_tools()
        yield
        if app.state.jobs.current:
            await app.state.jobs.reset(app.state.jobs.current.job_id)

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.jobs = JobManager()
    app.state.tools = {"ready": False, "error": "Media tools have not been checked yet."}

    @app.middleware("http")
    async def local_boundary(request, call_next):
        origin = request.headers.get("origin")
        if request.url.hostname not in ALLOWED_HOSTS or (origin and origin not in ALLOWED_ORIGINS) or request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse({"error": {"code": "local_only", "message": "Open FrameCheck from its local address."}}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(MediaError)
    async def media_error(request, error):
        return JSONResponse({"error": error.public()}, status_code=error.status)

    def require_tools():
        if not app.state.tools["ready"]:
            raise MediaError("missing_tools", app.state.tools["error"], 503)

    @app.get("/api/config")
    async def config():
        current = app.state.jobs.current
        return {"limits": {"max_bytes": media.MAX_BYTES, "max_duration": media.MAX_DURATION},
                "supported": media.SUPPORTED, "settings": SETTINGS, "tools": app.state.tools,
                "current_job": {"job_id": current.job_id, "filename": current.filename, "analysis_status": current.analysis["status"]} if current else None}

    @app.post("/api/jobs", status_code=202)
    async def upload(request: Request, filename: str):
        require_tools()
        if Path(filename).suffix.lower() not in (".mp4", ".mov", ".mkv", ".webm"):
            raise MediaError("unsupported_container", "Choose an MP4, MOV, MKV, or WebM video.", 415)
        length = request.headers.get("content-length")
        if length:
            try:
                size = int(length)
            except ValueError:
                raise MediaError("invalid_upload", "The upload has an invalid content length.", 400) from None
            if size < 0:
                raise MediaError("invalid_upload", "The upload has an invalid content length.", 400)
            if size > media.MAX_BYTES:
                raise MediaError("file_too_large", "The video exceeds the 500 MB file-size limit.", 413)
        manager = app.state.jobs
        job = manager.create(filename)

        async def receive():
            with job.original.open("wb") as destination:
                async for chunk in request.stream():
                    job.byte_count += len(chunk)
                    if job.byte_count > media.MAX_BYTES:
                        raise MediaError("file_too_large", "The video exceeds the 500 MB file-size limit.", 413)
                    destination.write(chunk)
            if not job.byte_count:
                raise MediaError("empty_file", "The selected file is empty.")
            if length and job.byte_count != int(length):
                raise MediaError("incomplete_upload", "The upload did not finish. Please try again.", 400)

        job.task = asyncio.create_task(receive())
        try:
            await job.task
        except (ClientDisconnect, asyncio.CancelledError):
            manager.discard(job)
            raise MediaError("upload_interrupted", "The upload was interrupted. Please try again.", 400) from None
        except OSError:
            manager.discard(job)
            raise MediaError("storage_failed", "The video could not be saved locally. Check available disk space.", 507) from None
        except Exception:
            manager.discard(job)
            raise
        manager.start_analysis(job)
        return job.public()

    @app.post("/api/demo", status_code=202)
    async def demo():
        require_tools()
        sample = ROOT / "samples" / "demo.mp4"
        if not sample.is_file():
            raise MediaError("demo_missing", "The demo video is missing. Run the sample generator described in README.md.", 503)
        manager = app.state.jobs
        job = manager.create("FrameCheck demo.mp4")
        try:
            shutil.copyfile(sample, job.original)
            job.byte_count = job.original.stat().st_size
        except OSError:
            manager.discard(job)
            raise MediaError("storage_failed", "The demo could not be prepared locally. Check available disk space.", 507) from None
        manager.start_analysis(job)
        return job.public()

    @app.get("/api/jobs/{job_id}")
    async def get_job(job_id: str):
        return app.state.jobs.get(job_id).public()

    @app.post("/api/jobs/{job_id}/preview", status_code=202)
    async def preview(job_id: str):
        job = app.state.jobs.get(job_id)
        app.state.jobs.start_preview(job)
        return job.public()

    @app.get("/api/jobs/{job_id}/media/{source}")
    async def get_media(job_id: str, source: str):
        job = app.state.jobs.get(job_id)
        if source == "original" and job.analysis["status"] == "complete":
            path = job.original
            mime = {"MP4": "video/mp4", "MOV": "video/quicktime", "MKV": "video/x-matroska", "WebM": "video/webm"}[job.media["container"]]
        elif source == "preview" and job.preview["status"] == "complete":
            path, mime = job.preview_path, "video/mp4"
        else:
            raise MediaError("media_unavailable", "This video source is not available for playback.", 404)
        return FileResponse(path, media_type=mime)

    @app.delete("/api/jobs/{job_id}", status_code=204)
    async def reset(job_id: str):
        await app.state.jobs.reset(job_id)
        return Response(status_code=204)

    build = ROOT / "frontend" / "dist"
    if build.is_dir():
        app.mount("/", StaticFiles(directory=build, html=True), name="workspace")
    else:
        @app.get("/")
        async def missing_build():
            return JSONResponse({"message": "Build the interface with npm --prefix frontend run build, then restart the server."}, status_code=503)
    return app


app = create_app()
