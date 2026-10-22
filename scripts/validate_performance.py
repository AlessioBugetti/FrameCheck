"""Measure the real local HTTP pipeline on a near-limit synthetic video.

Uses isolated port 8766. Generates media under the supplied output directory;
large fixtures are intentionally excluded from version control.
"""
import argparse
import asyncio
import json
from pathlib import Path
import subprocess
import time

import httpx

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8766"


def ffmpeg(*arguments):
    subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", *map(str, arguments)], check=True, timeout=180)


async def main(output):
    output.mkdir(parents=True, exist_ok=True)
    segment, source = output / "segment.mp4", output / "near-limit.mp4"
    if not source.exists():
        ffmpeg("-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=10", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=10", "-c:v", "libx264", "-threads", "4", "-preset", "veryfast", "-b:v", "12M", "-minrate", "12M", "-maxrate", "12M", "-bufsize", "24M", "-x264-params", "nal-hrd=cbr:force-cfr=1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", segment)
        ffmpeg("-stream_loop", "29", "-i", segment, "-c", "copy", "-t", "299.8", "-movflags", "+faststart", source)
    assert 450_000_000 < source.stat().st_size <= 500_000_000
    async with httpx.AsyncClient(timeout=180) as client:
        try:
            await client.get(BASE + "/api/config", timeout=1)
        except httpx.ConnectError:
            pass
        else:
            raise RuntimeError("Port 8766 is occupied. Stop its test server before running this validation.")
        server = subprocess.Popen([str(ROOT / ".venv/bin/python"), "-m", "uvicorn", "framecheck.server:app", "--host", "127.0.0.1", "--port", "8766", "--workers", "1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            async with asyncio.timeout(15):
                while True:
                    try:
                        response = await client.get(BASE + "/api/config")
                        if response.status_code == 200:
                            break
                    except httpx.ConnectError:
                        pass
                    await asyncio.sleep(0.1)
            async def chunks():
                with source.open("rb") as handle:
                    while chunk := handle.read(1_048_576):
                        yield chunk
            start = time.perf_counter()
            response = await client.post(BASE + "/api/jobs", params={"filename": source.name}, content=chunks(), headers={"Content-Length": str(source.stat().st_size)})
            response.raise_for_status()
            uploaded = time.perf_counter()
            job = response.json()
            job_id = job["job_id"]
            analysis_started = None
            async with asyncio.timeout(180):
                while job["analysis"]["status"] not in ("complete", "failed"):
                    job = (await client.get(f"{BASE}/api/jobs/{job_id}")).json()
                    if job["analysis"]["status"] == "running" and analysis_started is None:
                        analysis_started = time.perf_counter()
                    await asyncio.sleep(0.1)
            completed = time.perf_counter()
            assert job["analysis"]["status"] == "complete", job
            assert not job["findings"], job["findings"]
            assert 299.5 <= job["media"]["duration"] <= 300
            await client.post(f"{BASE}/api/jobs/{job_id}/preview")
            preview_started = time.perf_counter()
            async with asyncio.timeout(180):
                while True:
                    job = (await client.get(f"{BASE}/api/jobs/{job_id}")).json()
                    if job["preview"]["status"] in ("complete", "failed"):
                        break
                    await asyncio.sleep(0.1)
            preview_completed = time.perf_counter()
            assert job["preview"]["status"] == "complete", job
            preview_path = output / "near-limit-preview.mp4"
            async with client.stream("GET", BASE + job["media_urls"]["preview"]) as response:
                response.raise_for_status()
                with preview_path.open("wb") as handle:
                    async for chunk in response.aiter_bytes():
                        handle.write(chunk)
            results = {
                "fixture": source.name, "bytes": source.stat().st_size, "media": job["media"],
                "upload_seconds": round(uploaded - start, 3),
                "inspection_seconds_approximate": round((analysis_started or completed) - uploaded, 3),
                "analysis_seconds_approximate": round(completed - (analysis_started or uploaded), 3),
                "upload_to_analysis_complete_seconds": round(completed - start, 3),
                "preview_seconds_including_output_inspection": round(preview_completed - preview_started, 3),
                "preview_bytes": preview_path.stat().st_size, "findings": job["findings"],
                "note": "Real HTTP upload, production inspection/detection/preview, phases observed by 100 ms polling. Synthetic 1080p30 H.264/AAC; no universal timing guarantee.",
            }
            (output / "performance.json").write_text(json.dumps(results, indent=2) + "\n")
            print(json.dumps(results, indent=2), flush=True)
            await client.delete(f"{BASE}/api/jobs/{job_id}")
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill(); server.wait()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    asyncio.run(main(parser.parse_args().output.resolve()))
