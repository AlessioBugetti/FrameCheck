import asyncio
from collections import deque
import json
import logging
import math
from pathlib import Path

from .detection import AUDIO_FILTER, VIDEO_FILTER, Detector

MAX_BYTES = 500_000_000
MAX_DURATION = 300.0
PREVIEW_MAX_BYTES = 1_000_000_000
PROBE_TIMEOUT = 30
PROCESS_TIMEOUT = 600
SUPPORTED = [
    {"container": "MP4", "video": "H.264 (8-bit 4:2:0)", "audio": "AAC-LC or no audio"},
    {"container": "MOV", "video": "H.264 (8-bit 4:2:0)", "audio": "AAC-LC or no audio"},
    {"container": "MOV", "video": "ProRes 422 standard", "audio": "PCM s16le or no audio"},
    {"container": "MKV", "video": "H.264 (8-bit 4:2:0)", "audio": "AAC-LC or no audio"},
    {"container": "WebM", "video": "VP9 profile 0", "audio": "Opus or no audio"},
]
logger = logging.getLogger(__name__)


class MediaError(Exception):
    def __init__(self, code, message, status=422):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status

    def public(self):
        return {"code": self.code, "message": self.message}


async def run_process(arguments, *, timeout=PROCESS_TIMEOUT, stdout=None, stderr=None, output=None):
    process = await asyncio.create_subprocess_exec(
        *arguments, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    tail = deque(maxlen=30)
    reported_error = False

    async def read(stream, callback, diagnostic=False):
        nonlocal reported_error
        while line := await stream.readline():
            line = line.decode("utf-8", errors="replace").strip()
            if diagnostic:
                tail.append(line[-500:])
                if any(level in line for level in ("[error]", "[fatal]", "[panic]")):
                    reported_error = True
            if callback:
                callback(line)

    async def watch_output():
        while process.returncode is None:
            if output.exists() and output.stat().st_size > PREVIEW_MAX_BYTES:
                raise MediaError("preview_too_large", "The compatible preview exceeded its 1 GB limit.")
            await asyncio.sleep(0.2)

    tasks = [asyncio.create_task(read(process.stdout, stdout)),
             asyncio.create_task(read(process.stderr, stderr, True)),
             asyncio.create_task(process.wait())]
    if output:
        tasks.append(asyncio.create_task(watch_output()))
    try:
        async with asyncio.timeout(timeout):
            await asyncio.gather(*tasks)
        if process.returncode or reported_error:
            logger.warning("Media command failed (%s): %s", process.returncode, "\n".join(tail))
            raise MediaError("decode_failed", "This video could not be decoded reliably. It may be damaged or use unsupported media features.")
        if output and output.stat().st_size > PREVIEW_MAX_BYTES:
            raise MediaError("preview_too_large", "The compatible preview exceeded its 1 GB limit.")
    except TimeoutError:
        raise MediaError("processing_timeout", "Processing exceeded its time limit. Try a shorter or smaller video.") from None
    finally:
        if process.returncode is None:
            process.kill()
        await process.wait()
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


def input_options(path):
    return ["-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm", "-i", str(path)]


async def probe(path):
    lines = []
    size = 0

    def collect(line):
        nonlocal size
        size += len(line)
        if size > 1_000_000:
            raise MediaError("metadata_too_large", "This video's metadata is too large to inspect safely.")
        lines.append(line)

    await run_process(["ffprobe", "-v", "level+error", *input_options(path), "-show_format", "-show_streams", "-of", "json"],
                      timeout=PROBE_TIMEOUT, stdout=collect)
    try:
        return json.loads("\n".join(lines))
    except ValueError:
        raise MediaError("invalid_video", "This file does not contain readable video metadata.") from None


def finite(value):
    try:
        number = float(value)
        if math.isfinite(number):
            return number
    except (TypeError, ValueError):
        pass
    raise MediaError("unsupported_timing", "This video has missing or invalid timestamps; a reliable review timeline could not be established.")


def validate_streams(data, filename):
    extension = Path(filename).suffix.lower()
    formats = data.get("format", {}).get("format_name", "").split(",")
    containers = {".mp4": "mov", ".mov": "mov", ".mkv": "matroska", ".webm": "webm"}
    if extension not in containers or containers[extension] not in formats:
        raise MediaError("unsupported_container", "Use an MP4, MOV, MKV, or WebM file whose contents match its container.", 415)
    streams = data.get("streams", [])
    videos = [item for item in streams if item.get("codec_type") == "video" and not item.get("disposition", {}).get("attached_pic")]
    audios = [item for item in streams if item.get("codec_type") == "audio"]
    if len(videos) != 1 or len(audios) > 1:
        raise MediaError("unsupported_tracks", "Use a file with exactly one video track and at most one audio track.", 415)
    video, audio = videos[0], audios[0] if audios else None
    codec, pixels = video.get("codec_name"), video.get("pix_fmt")
    h264 = codec == "h264" and pixels == "yuv420p"
    prores = codec == "prores" and video.get("profile") == "Standard" and pixels == "yuv422p10le"
    vp9 = codec == "vp9" and video.get("profile") == "Profile 0" and pixels == "yuv420p"
    expected_audio = None
    if extension in (".mp4", ".mov", ".mkv") and h264:
        expected_audio = "aac"
    elif extension == ".mov" and prores:
        expected_audio = "pcm_s16le"
    elif extension == ".webm" and vp9:
        expected_audio = "opus"
    if expected_audio is None or (audio and (audio.get("codec_name") != expected_audio or (expected_audio == "aac" and audio.get("profile") != "LC"))):
        raise MediaError("unsupported_codec", f"Unsupported combination: {codec or 'unknown video'} / {audio.get('codec_name') if audio else 'no audio'}. Use H.264/AAC in MP4, MOV or MKV, ProRes 422/PCM in MOV, or VP9/Opus in WebM.", 415)
    if not video.get("width") or not video.get("height"):
        raise MediaError("invalid_video", "The video has no usable image dimensions.")
    return video, audio


async def inspect_media(path, filename, *, enforce_limits=True):
    if Path(filename).suffix.lower() not in (".mp4", ".mov", ".mkv", ".webm"):
        raise MediaError("unsupported_container", "Choose an MP4, MOV, MKV, or WebM video.", 415)
    if enforce_limits and path.stat().st_size > MAX_BYTES:
        raise MediaError("file_too_large", "The video exceeds the 500 MB file-size limit.", 413)
    async with asyncio.timeout(PROBE_TIMEOUT):
        data = await probe(path)
        video, audio = validate_streams(data, filename)
        origin = finite(data.get("format", {}).get("start_time"))
        selected = {video["index"]: video}
        if audio:
            selected[audio["index"]] = audio
        ends = {}
        pending_audio_pts = {}

        def packet(line):
            values = dict(part.split("=", 1) for part in line.split("|") if "=" in part)
            if "stream_index" not in values:
                return
            index = int(values["stream_index"])
            if index not in selected:
                return
            pts = finite(values.get("pts_time"))
            if index in pending_audio_pts:
                previous_pts = pending_audio_pts.pop(index)
                if not 0 < pts - previous_pts <= 0.1:
                    raise MediaError("unsupported_timing", "An audio packet has no trustworthy duration.")
                ends[index] = max(ends.get(index, 0), pts - origin)
            if values.get("duration_time") in (None, "N/A") and selected[index].get("codec_name") == "aac":
                # AAC priming packets may omit duration; the next audio PTS supplies their end.
                pending_audio_pts[index] = pts
                return
            duration = finite(values.get("duration_time"))
            if duration <= 0:
                raise MediaError("unsupported_timing", "A media packet has no usable duration; reliable timeline alignment is unavailable.")
            end = pts + duration - origin
            if end < -0.1:
                raise MediaError("unsupported_timing", "The source contains timestamps before its supported review timeline.")
            ends[index] = max(ends.get(index, 0), end)

        await run_process(["ffprobe", "-v", "level+error", *input_options(path), "-show_packets", "-show_entries", "packet=stream_index,pts_time,duration_time", "-of", "compact=p=0:nk=0"],
                          timeout=PROBE_TIMEOUT, stdout=packet)
        if pending_audio_pts:
            raise MediaError("unsupported_timing", "The final audio packet has no usable duration; the review timeline cannot be established.")
        if any(index not in ends or ends[index] <= 0 for index in selected):
            raise MediaError("unsupported_timing", "A selected track has no usable timestamped media packets.")
        duration = max(ends.values())
        if enforce_limits and duration > MAX_DURATION + 1e-6:
            raise MediaError("video_too_long", "The video exceeds the five-minute duration limit.")
        ignored = sorted({item.get("codec_type", "unknown") for item in data["streams"] if item["index"] not in selected})
        return {"container": {".mp4": "MP4", ".mov": "MOV", ".mkv": "MKV", ".webm": "WebM"}[Path(filename).suffix.lower()],
                "duration": duration, "video_end": ends[video["index"]], "audio_end": ends[audio["index"]] if audio else None,
                "source_origin": origin, "has_audio": audio is not None, "video_index": video["index"], "audio_index": audio["index"] if audio else None,
                "video_codec": video["codec_name"], "audio_codec": audio["codec_name"] if audio else None,
                "width": video["width"], "height": video["height"], "ignored_streams": ignored,
                "requires_preview": video["codec_name"] == "prores" or abs(origin) > 0.05}


def ffmpeg_input(path):
    return ["ffmpeg", "-hide_banner", "-loglevel", "level+info", "-nostdin", "-y", "-xerror", "-threads", "4", "-copyts", "-start_at_zero", *input_options(path)]


def progress_reader(duration, callback):
    def read(line):
        if line.startswith("out_time_us="):
            try:
                callback(min(0.99, max(0, float(line.split("=", 1)[1]) / 1_000_000 / duration)))
            except ValueError:
                pass
    return read


async def analyze(path, metadata, progress=lambda value: None):
    detector = Detector()
    args = [*ffmpeg_input(path), "-map", f"0:{metadata['video_index']}", "-vf", VIDEO_FILTER]
    if metadata["has_audio"]:
        args += ["-map", f"0:{metadata['audio_index']}", "-af", AUDIO_FILTER]
    args += ["-progress", "pipe:1", "-nostats", "-f", "null", "-"]
    await run_process(args, stdout=progress_reader(metadata["duration"], progress), stderr=detector.feed)
    return detector.finish(metadata["video_end"], metadata["audio_end"])


async def make_preview(path, output, metadata, progress=lambda value: None):
    args = [*ffmpeg_input(path), "-map", f"0:{metadata['video_index']}"]
    if metadata["has_audio"]:
        args += ["-map", f"0:{metadata['audio_index']}"]
    args += ["-c:v", "libx264", "-threads", "4", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-fps_mode", "vfr", "-c:a", "aac", "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", str(output)]
    try:
        await run_process(args, stdout=progress_reader(metadata["duration"], progress), output=output)
        preview = await inspect_media(output, "preview.mp4", enforce_limits=False)
        if abs(preview["duration"] - metadata["duration"]) > 0.1:
            raise MediaError("preview_alignment", "The preview timeline did not match the original. Playback is unavailable; analysis results are retained.")
    except BaseException:
        output.unlink(missing_ok=True)
        raise


async def check_tools():
    try:
        for executable in ("ffmpeg", "ffprobe"):
            await run_process([executable, "-version"], timeout=5)
        for option, required in (("-decoders", ("h264", "prores", "vp9", "aac", "pcm_s16le", "opus")),
                                 ("-encoders", ("libx264", "aac")),
                                 ("-filters", ("blackdetect", "freezedetect", "silencedetect", "metadata"))):
            lines = []
            await run_process(["ffmpeg", "-hide_banner", option], timeout=5, stdout=lines.append)
            names = {line.split()[1] for line in lines if len(line.split()) > 1}
            if not set(required) <= names:
                raise MediaError("missing_tools", "FFmpeg is missing required codecs or detection filters.")
        return {"ready": True, "error": None}
    except (OSError, MediaError):
        return {"ready": False, "error": "Install FFmpeg and ffprobe with H.264, ProRes, VP9, AAC, PCM, Opus, libx264 and the detection filters, then restart FrameCheck."}
