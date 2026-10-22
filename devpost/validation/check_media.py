import json
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parent
RESULTS = []


def run(label, arguments, timeout=120):
    started = time.monotonic()
    result = subprocess.run(arguments, capture_output=True, text=True, timeout=timeout)
    elapsed = round(time.monotonic() - started, 3)
    (ROOT / f"{label}.log").write_text(result.stderr)
    assert result.returncode == 0, f"{label}: {result.stderr[-2000:]}"
    return result, elapsed


def ffmpeg(label, arguments):
    return run(label, ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-threads", "4", *arguments])


def probe(path):
    result, _ = run("probe", ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)])
    return json.loads(result.stdout)


def analyze(path):
    metadata = probe(path)
    audio = any(stream["codec_type"] == "audio" for stream in metadata["streams"])
    arguments = ["-i", str(path), "-map", "0:v:0", "-vf", "blackdetect=d=0.5:pic_th=0.98:pix_th=0.10,freezedetect=n=-60dB:d=1"]
    if audio:
        arguments += ["-map", "0:a:0", "-af", "silencedetect=n=-40dB:d=1"]
    result, elapsed = ffmpeg(path.stem + "-analysis", [*arguments, "-f", "null", "-"])
    events = re.findall(r"(?:black_start|black_end|freeze_start|freeze_end|silence_start|silence_end)[:=]\s*([0-9.]+)", result.stderr)
    assert events, f"No events for {path.name}"
    for expected in (2, 3, 6, 8, 9, 11):
        assert any(abs(float(value) - expected) < 0.15 for value in events), (path.name, expected, events)
    return elapsed, [line for line in result.stderr.splitlines() if re.search(r"black_start|freeze_start|freeze_end|silence_start|silence_end", line)]


def main():
    base = ROOT / "h264-aac.mp4"
    ffmpeg("generate-source", [
        "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=12",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=12",
        "-vf", "drawbox=color=black:t=fill:enable='gte(t,2)*lt(t,3)',select='not(gte(t,6)*lt(t,8))',fps=30",
        "-af", "volume=0:enable='gte(t,9)*lt(t,11)'",
        "-c:v", "libx264", "-threads", "4", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(base),
    ])
    variants = [
        ("h264-aac.mov", ["-c", "copy"]),
        ("h264-aac.mkv", ["-c", "copy"]),
        ("prores-pcm.mov", ["-c:v", "prores_ks", "-threads", "4", "-profile:v", "2", "-pix_fmt", "yuv422p10le", "-c:a", "pcm_s16le"]),
        ("vp9-opus.webm", ["-c:v", "libvpx-vp9", "-threads", "4", "-deadline", "realtime", "-cpu-used", "6", "-b:v", "0", "-crf", "32", "-c:a", "libopus"]),
    ]
    for name, arguments in variants:
        ffmpeg("generate-" + name, ["-i", str(base), *arguments, str(ROOT / name)])
    for path in [base, *(ROOT / name for name, _ in variants)]:
        metadata = probe(path)
        elapsed, events = analyze(path)
        RESULTS.append({"file": path.name, "bytes": path.stat().st_size, "duration": metadata["format"]["duration"], "streams": [{key: stream.get(key) for key in ("codec_type", "codec_name", "pix_fmt", "start_time", "duration")} for stream in metadata["streams"]], "analysis_seconds": elapsed, "events": events})
        print(json.dumps(RESULTS[-1]), flush=True)
    source = ROOT / "prores-pcm.mov"
    preview = ROOT / "preview.mp4"
    _, elapsed = ffmpeg("preview", ["-i", str(source), "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-threads", "4", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-fps_mode", "vfr", "-c:a", "aac", "-movflags", "+faststart", str(preview)])
    _, events = analyze(preview)
    assert abs(float(probe(preview)["format"]["duration"]) - float(probe(source)["format"]["duration"])) < 0.05
    RESULTS.append({"file": preview.name, "preview_seconds": elapsed, "events": events})
    (ROOT / "results.json").write_text(json.dumps(RESULTS, indent=2))
    print("PASS: five container/codec combinations decoded; preview events and duration aligned", flush=True)


if __name__ == "__main__":
    main()
