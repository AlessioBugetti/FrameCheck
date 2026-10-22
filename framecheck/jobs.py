import asyncio
from dataclasses import dataclass, field
import logging
from pathlib import Path
import shutil
import tempfile
import uuid

from .detection import SETTINGS
from .media import MediaError, analyze, inspect_media, make_preview

logger = logging.getLogger(__name__)


def phase(status):
    return {"status": status, "progress": None, "error": None}


@dataclass
class Job:
    filename: str
    directory: Path
    job_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    byte_count: int = 0
    analysis: dict = field(default_factory=lambda: phase("validating"))
    preview: dict = field(default_factory=lambda: phase("idle"))
    media: dict | None = None
    findings: list = field(default_factory=list)
    task: asyncio.Task | None = None

    @property
    def original(self):
        return self.directory / "original"

    @property
    def preview_path(self):
        return self.directory / "preview.mp4"

    def public(self):
        base = f"/api/jobs/{self.job_id}/media"
        return {"job_id": self.job_id, "filename": self.filename, "byte_count": self.byte_count,
                "analysis": self.analysis.copy(), "preview": self.preview.copy(),
                "media": self.media, "findings": self.findings, "settings": SETTINGS,
                "media_urls": {"original": f"{base}/original" if self.analysis["status"] == "complete" else None,
                               "preview": f"{base}/preview" if self.preview["status"] == "complete" else None}}


class JobManager:
    def __init__(self):
        self.current = None
        self.reset_lock = asyncio.Lock()

    def create(self, filename):
        if self.current:
            raise MediaError("job_exists", "A video is already loaded. Reset the current job before loading another.", 409)
        if shutil.disk_usage(tempfile.gettempdir()).free < 2_000_000_000:
            raise MediaError("insufficient_space", "FrameCheck needs at least 2 GB of free temporary disk space.", 507)
        filename = filename.replace("\\", "/").rsplit("/", 1)[-1]
        filename = "".join(char for char in filename if char.isprintable())
        if not filename:
            raise MediaError("invalid_filename", "Choose a video with a readable filename.", 422)
        self.current = Job(filename, Path(tempfile.mkdtemp(prefix="framecheck-")))
        return self.current

    def get(self, job_id):
        if not self.current or self.current.job_id != job_id:
            raise MediaError("job_not_found", "This review is no longer available. Load a video to start again.", 404)
        return self.current

    def discard(self, job):
        shutil.rmtree(job.directory, ignore_errors=True)
        if self.current is job:
            self.current = None

    async def reset(self, job_id):
        async with self.reset_lock:
            job = self.get(job_id)
            if job.task and not job.task.done():
                job.task.cancel()
                await asyncio.gather(job.task, return_exceptions=True)
            self.discard(job)

    def start_analysis(self, job):
        if self.current is not job:
            raise MediaError("job_cancelled", "This upload was reset before analysis began. Load a video to start again.", 409)
        job.task = asyncio.create_task(self.process(job, preview=False))

    def start_preview(self, job):
        if job.analysis["status"] != "complete":
            raise MediaError("analysis_pending", "Complete analysis before preparing a preview.", 409)
        if job.preview["status"] == "idle":
            job.preview = phase("running")
            job.task = asyncio.create_task(self.process(job, preview=True))

    async def process(self, job, *, preview):
        state = job.preview if preview else job.analysis
        try:
            if preview:
                await make_preview(job.original, job.preview_path, job.media, lambda value: state.update(progress=value))
            else:
                job.media = await inspect_media(job.original, job.filename)
                state.update(status="running", progress=0.0)
                job.findings = await analyze(job.original, job.media, lambda value: state.update(progress=value))
            state.update(status="complete", progress=1.0)
        except asyncio.CancelledError:
            raise
        except (MediaError, OSError, TimeoutError) as error:
            if isinstance(error, MediaError):
                detail = error.public()
            elif isinstance(error, TimeoutError):
                detail = {"code": "processing_timeout", "message": "Video inspection exceeded its time limit. Try a shorter or smaller file."}
            else:
                detail = {"code": "processing_unavailable", "message": "Local processing failed. Check available disk space and the FFmpeg installation."}
                logger.exception("Local media operation failed")
            state.update(status="failed", progress=None, error=detail)
            if not preview:
                job.findings = []
                job.original.unlink(missing_ok=True)
        except Exception:
            logger.exception("Unexpected media processing failure")
            state.update(status="failed", progress=None, error={"code": "processing_failed", "message": "This video could not be processed. Reset the job and try another supported file."})
            if not preview:
                job.findings = []
                job.original.unlink(missing_ok=True)
