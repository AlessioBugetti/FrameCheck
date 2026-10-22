from check_media import ROOT, ffmpeg, probe, run
import json
import re


def events(path):
    result, elapsed = ffmpeg(path.stem + "-timing", ["-benchmark", "-copyts", "-start_at_zero", "-i", str(path), "-map", "0:v:0", "-vf", "blackdetect=d=0.5:pic_th=0.98:pix_th=0.1,freezedetect=n=-60dB:d=1", "-map", "0:a:0", "-af", "silencedetect=n=-40dB:d=1", "-f", "null", "-"])
    values = {}
    for kind, value in re.findall(r"(black_start|black_end|freeze_start|freeze_end|silence_start|silence_end)[:=]\s*([0-9.]+)", result.stderr):
        values.setdefault(kind, []).append(float(value))
    return values, elapsed, int(re.search(r"maxrss=(\d+)(?:KiB|kB)", result.stderr).group(1))


def main():
    source = ROOT / "h264-aac.mp4"
    ffmpeg("offset-source", ["-i", str(source), "-c", "copy", "-output_ts_offset", "5", str(ROOT / "offset.mkv")])
    ffmpeg("variable-source", ["-i", str(source), "-vf", "select='gte(t,6)+not(mod(n,2))'", "-fps_mode", "vfr", "-c:v", "libx264", "-threads", "4", "-preset", "veryfast", "-crf", "18", "-c:a", "copy", str(ROOT / "variable.mkv")])
    ffmpeg("delayed-audio-source", ["-i", str(source), "-itsoffset", "1", "-i", str(source), "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", str(ROOT / "delayed-audio.mkv")])
    timing = []
    for name in ("offset.mkv", "variable.mkv", "delayed-audio.mkv"):
        original = ROOT / name
        preview = ROOT / (original.stem + "-preview.mp4")
        ffmpeg(original.stem + "-preview", ["-copyts", "-start_at_zero", "-i", str(original), "-map", "0:v:0", "-map", "0:a:0", "-c:v", "libx264", "-threads", "4", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-fps_mode", "vfr", "-c:a", "aac", "-movflags", "+faststart", str(preview)])
        before, _, _ = events(original)
        after, _, _ = events(preview)
        differences = {}
        for key in ("black_start", "black_end", "silence_start", "silence_end"):
            assert len(before[key]) == len(after[key]), (name, key, before, after)
            differences[key] = max(abs(a-b) for a,b in zip(before[key],after[key]))
            assert differences[key] <= 0.1, (name, key, differences[key])
        item = {"source": name, "source_start": probe(original)["format"].get("start_time"), "original_events": before, "preview_events": after, "maximum_boundary_difference": max(differences.values())}
        timing.append(item)
        print(json.dumps(item), flush=True)
    segment = ROOT / "benchmark-segment.mp4"
    ffmpeg("benchmark-generate-segment", ["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=10", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=10", "-c:v", "libx264", "-threads", "4", "-preset", "veryfast", "-b:v", "12M", "-minrate", "12M", "-maxrate", "12M", "-bufsize", "24M", "-x264-params", "nal-hrd=cbr:force-cfr=1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", str(segment)])
    full = ROOT / "benchmark-300s.mp4"
    ffmpeg("benchmark-repeat", ["-stream_loop", "29", "-i", str(segment), "-c", "copy", "-t", "299.8", "-movflags", "+faststart", str(full)])
    metadata = probe(full)
    assert 450_000_000 < full.stat().st_size <= 500_000_000, full.stat().st_size
    assert 299.5 <= float(metadata["format"]["duration"]) <= 300
    print(json.dumps({"benchmark_ready": True, "bytes": full.stat().st_size, "duration": metadata["format"]["duration"]}), flush=True)
    detected, elapsed, rss = events(full)
    assert not detected, detected
    print(json.dumps({"analysis_seconds": elapsed, "maxrss_kib": rss}), flush=True)
    result, preview_elapsed = ffmpeg("benchmark-preview", ["-benchmark", "-copyts", "-start_at_zero", "-i", str(full), "-map", "0:v:0", "-map", "0:a:0", "-c:v", "libx264", "-threads", "4", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-fps_mode", "vfr", "-c:a", "aac", "-movflags", "+faststart", str(ROOT / "benchmark-preview.mp4")])
    performance = {"duration": metadata["format"]["duration"], "bytes": full.stat().st_size, "resolution": "1920x1080", "fps": 30, "video_codec": "h264", "audio_codec": "aac", "analysis_seconds": elapsed, "analysis_maxrss_kib": rss, "preview_seconds": preview_elapsed, "preview_maxrss_kib": int(re.search(r"maxrss=(\d+)(?:KiB|kB)", result.stderr).group(1)), "preview_bytes": (ROOT / "benchmark-preview.mp4").stat().st_size}
    (ROOT / "timing-performance.json").write_text(json.dumps({"timing": timing, "performance": performance}, indent=2))
    print(json.dumps(performance), flush=True)
    print("PASS: timestamp cases and five-minute near-limit synthetic benchmark", flush=True)


if __name__ == "__main__":
    main()
