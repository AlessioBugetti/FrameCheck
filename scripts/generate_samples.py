"""Generate small, deterministic videos for the demo and media acceptance tests."""

import argparse
import json
from pathlib import Path
import subprocess

EXPECTED = {
    "filename": "demo.mp4",
    "duration": 12.0,
    "tolerance": 0.25,
    "findings": [
        {"type": "black_frames", "start": 2.0, "end": 3.0},
        {"type": "frozen_frames", "start": 2.0, "end": 3.0},
        {"type": "frozen_frames", "start": 6.0, "end": 8.0},
        {"type": "silence", "start": 9.0, "end": 11.5},
    ],
    "note": "The black interval is also a frozen-frame candidate. All findings require human review.",
}


def ffmpeg(arguments):
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-threads", "4", *map(str, arguments)],
        capture_output=True, text=True, timeout=120,
    )
    if result.returncode:
        raise RuntimeError(result.stderr[-4000:])


def generate_samples(output, *, matrix=False):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    decoration = (
        "drawbox=x=0:y=0:w=iw:h=58:color=0x11151b:t=fill,"
        "drawtext=font='DejaVu Sans':text='FRAMECHECK  /  SYNTHETIC SAMPLE':"
        "x=24:y=20:fontsize=19:fontcolor=white,"
        "drawbox=x=0:y=312:w=iw:h=48:color=0x11151b:t=fill,"
        "drawtext=font='DejaVu Sans Mono':text='%{pts\\:hms}':"
        "x=24:y=326:fontsize=18:fontcolor=0x60a5fa"
    )
    for name in ("demo", "normal"):
        video_filter = decoration
        audio_filter = "volume=0.4"
        if name == "demo":
            video_filter += ",drawbox=color=black:t=fill:enable='gte(t,2)*lt(t,3)',select='not(gte(t,6)*lt(t,8))',fps=30"
            audio_filter += ",volume=0:enable='gte(t,9)*lt(t,11.5)'"
        ffmpeg([
            "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=12",
            "-f", "lavfi", "-i", "sine=frequency=523.25:sample_rate=48000:duration=12",
            "-vf", video_filter, "-af", audio_filter,
            "-c:v", "libx264", "-threads", "4", "-preset", "veryfast", "-crf", "18",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart", output / f"{name}.mp4",
        ])
    (output / "expected.json").write_text(json.dumps(EXPECTED, indent=2) + "\n")
    if matrix:
        variants = {
            "h264-aac.mov": ["-c", "copy"],
            "h264-aac.mkv": ["-c", "copy"],
            "prores-pcm.mov": ["-c:v", "prores_ks", "-threads", "4", "-profile:v", "2", "-pix_fmt", "yuv422p10le", "-c:a", "pcm_s16le"],
            "vp9-opus.webm": ["-c:v", "libvpx-vp9", "-threads", "4", "-deadline", "realtime", "-cpu-used", "6", "-crf", "32", "-b:v", "0", "-c:a", "libopus"],
        }
        for name, options in variants.items():
            ffmpeg(["-i", output / "demo.mp4", *options, output / name])
        for name in ("demo.mp4", *variants):
            source = output / name
            ffmpeg(["-i", source, "-map", "0:v:0", "-an", "-c", "copy", source.with_name(source.stem + "-no-audio" + source.suffix)])
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "samples")
    parser.add_argument("--matrix", action="store_true", help="Also generate the ten supported audio/no-audio combinations.")
    options = parser.parse_args()
    generate_samples(options.output, matrix=options.matrix)
    print(f"Generated synthetic samples in {options.output}")
