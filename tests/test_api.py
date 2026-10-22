import asyncio
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import httpx
from starlette.requests import ClientDisconnect

from framecheck import media
from framecheck.media import MediaError
from framecheck.server import create_app

SAMPLE = Path(__file__).resolve().parents[1] / "samples" / "demo.mp4"


class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.app = create_app()
        self.lifecycle = self.app.router.lifespan_context(self.app)
        await self.lifecycle.__aenter__()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://127.0.0.1:8765")

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.lifecycle.__aexit__(None, None, None)

    async def completed(self, job_id, phase="analysis"):
        async with asyncio.timeout(20):
            while True:
                response = await self.client.get(f"/api/jobs/{job_id}")
                self.assertEqual(response.status_code, 200)
                job = response.json()
                if job[phase]["status"] in ("complete", "failed"):
                    return job
                await asyncio.sleep(0.03)

    async def demo(self):
        response = await self.client.post("/api/demo")
        self.assertEqual(response.status_code, 202, response.text)
        return await self.completed(response.json()["job_id"])

    async def test_demo_range_busy_and_reset(self):
        config = (await self.client.get("/api/config")).json()
        self.assertTrue(config["tools"]["ready"])
        job = await self.demo()
        self.assertEqual(job["analysis"]["status"], "complete", job)
        self.assertEqual({finding["type"] for finding in job["findings"]}, {"black_frames", "frozen_frames", "silence"})
        self.assertNotIn("directory", job)
        self.assertEqual((await self.client.post("/api/demo")).status_code, 409)
        media_url = job["media_urls"]["original"]
        response = await self.client.get(media_url, headers={"Range": "bytes=100-199"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, SAMPLE.read_bytes()[100:200])
        self.assertTrue(response.headers["content-range"].startswith("bytes 100-199/"))
        self.assertEqual((await self.client.get(media_url.replace("original", "unknown"))).status_code, 404)
        directory = self.app.state.jobs.current.directory
        discovered = (await self.client.get("/api/config")).json()["current_job"]
        self.assertEqual(discovered["job_id"], job["job_id"])
        self.assertEqual((await self.client.delete(f"/api/jobs/{job['job_id']}")).status_code, 204)
        self.assertFalse(directory.exists())
        self.assertEqual((await self.client.get(media_url)).status_code, 404)
        self.assertIsNone((await self.client.get("/api/config")).json()["current_job"])

    async def test_upload_exact_byte_boundary_and_overflow(self):
        content = SAMPLE.read_bytes()
        with patch.object(media, "MAX_BYTES", len(content)):
            response = await self.client.post("/api/jobs", params={"filename": "../../example.mp4"}, content=content)
            self.assertEqual(response.status_code, 202, response.text)
            job = await self.completed(response.json()["job_id"])
            self.assertEqual(job["filename"], "example.mp4")
            self.assertEqual(job["analysis"]["status"], "complete")
            await self.client.delete(f"/api/jobs/{job['job_id']}")
        with patch.object(media, "MAX_BYTES", len(content) - 1):
            response = await self.client.post("/api/jobs?filename=example.mp4", content=content)
            self.assertEqual(response.status_code, 413)
            self.assertIsNone(self.app.state.jobs.current)

        async def chunks():
            yield b"1234"
            yield b"5678"

        with patch.object(media, "MAX_BYTES", 6):
            response = await self.client.post("/api/jobs?filename=example.mp4", content=chunks())
            self.assertEqual(response.status_code, 413)
            self.assertIsNone(self.app.state.jobs.current)

    async def test_partial_upload_cleans_current_job(self):
        directory = None

        async def interrupted():
            nonlocal directory
            directory = self.app.state.jobs.current.directory
            yield b"partial content"
            raise ClientDisconnect()

        response = await self.client.post("/api/jobs?filename=example.mp4", content=interrupted())
        self.assertEqual(response.status_code, 400)
        self.assertIsNone(self.app.state.jobs.current)
        self.assertFalse(directory.exists())

    async def test_cancel_inflight_upload(self):
        entered = asyncio.Event()

        async def slow_upload():
            yield b"partial content"
            entered.set()
            await asyncio.Event().wait()

        upload = asyncio.create_task(self.client.post("/api/jobs?filename=example.mp4", content=slow_upload()))
        async with asyncio.timeout(5):
            await entered.wait()
            job = self.app.state.jobs.current
            response = await self.client.delete(f"/api/jobs/{job.job_id}")
            self.assertEqual(response.status_code, 204)
            result = await upload
        self.assertEqual(result.status_code, 400)
        self.assertFalse(job.directory.exists())
        self.assertIsNone(self.app.state.jobs.current)

    async def test_unsupported_and_invalid_inputs(self):
        response = await self.client.post("/api/jobs?filename=clip.avi", content=b"x")
        self.assertEqual(response.status_code, 415)
        self.assertIsNone(self.app.state.jobs.current)
        response = await self.client.post("/api/jobs?filename=clip.mp4", content=b"")
        self.assertEqual(response.status_code, 422)
        self.assertIsNone(self.app.state.jobs.current)
        response = await self.client.post("/api/jobs?filename=clip.mp4", content=b"not a video")
        job = await self.completed(response.json()["job_id"])
        self.assertEqual(job["analysis"]["status"], "failed")
        self.assertTrue(job["analysis"]["error"]["message"])
        self.assertEqual(job["findings"], [])
        self.assertIsNone(job["media_urls"]["original"])
        self.assertFalse(self.app.state.jobs.current.original.exists())

    async def test_preview_failure_keeps_analysis(self):
        job = await self.demo()

        async def fail(*args, **kwargs):
            raise MediaError("preview_too_large", "The compatible preview exceeded its 1 GB limit.")

        with patch("framecheck.jobs.make_preview", fail):
            response = await self.client.post(f"/api/jobs/{job['job_id']}/preview")
            self.assertEqual(response.status_code, 202)
            after = await self.completed(job["job_id"], "preview")
        self.assertEqual(after["analysis"]["status"], "complete")
        self.assertEqual(after["findings"], job["findings"])
        self.assertEqual(after["preview"]["status"], "failed")
        self.assertIsNone(after["media_urls"]["preview"])
        self.assertTrue(all("decision" not in finding for finding in after["findings"]))

    async def test_local_origin_and_host_restrictions(self):
        for headers in ({"Host": "evil.example"}, {"Origin": "https://evil.example"}, {"Sec-Fetch-Site": "cross-site"}):
            response = await self.client.post("/api/demo", headers=headers)
            self.assertEqual(response.status_code, 403)
        self.assertIsNone(self.app.state.jobs.current)

    async def test_reset_cancels_analysis_before_cleanup(self):
        entered = asyncio.Event()

        async def stalled(*args, **kwargs):
            entered.set()
            await asyncio.Event().wait()

        with patch("framecheck.jobs.inspect_media", stalled):
            response = await self.client.post("/api/demo")
            await asyncio.wait_for(entered.wait(), 5)
            job = self.app.state.jobs.current
            task = job.task
            self.assertEqual((await self.client.delete(f"/api/jobs/{response.json()['job_id']}")).status_code, 204)
            self.assertTrue(task.cancelled())
            self.assertFalse(job.directory.exists())

    async def test_storage_failure_and_incomplete_upload_leave_no_job(self):
        with patch("framecheck.server.shutil.copyfile", side_effect=OSError("Disk full")):
            response = await self.client.post("/api/demo")
        self.assertEqual(response.status_code, 507)
        self.assertEqual(response.json()["error"]["code"], "storage_failed")
        self.assertIsNone(self.app.state.jobs.current)
        response = await self.client.post("/api/jobs?filename=video.mp4", content=b"short", headers={"Content-Length": "20"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "incomplete_upload")
        self.assertIsNone(self.app.state.jobs.current)

    async def test_subprocess_timeout_terminates(self):
        with self.assertRaisesRegex(MediaError, "time limit"):
            await media.run_process([sys.executable, "-c", "import time; time.sleep(20)"], timeout=0.05)

    async def test_reset_between_upload_and_analysis_cannot_start_orphan_job(self):
        manager = self.app.state.jobs
        uploaded = manager.create("uploaded.mp4")
        uploaded.original.write_bytes(SAMPLE.read_bytes())
        await manager.reset(uploaded.job_id)
        replacement = manager.create("replacement.mp4")
        with self.assertRaises(MediaError) as error:
            manager.start_analysis(uploaded)
        self.assertEqual(error.exception.code, "job_cancelled")
        self.assertIs(manager.current, replacement)
        self.assertIsNone(uploaded.task)
        self.assertIsNone(replacement.task)

    async def test_long_filename_preserves_original_name_and_extension(self):
        filename = "a" * 246 + ".mp4"
        response = await self.client.post("/api/jobs", params={"filename": filename}, content=SAMPLE.read_bytes())
        self.assertEqual(response.status_code, 202)
        job = await self.completed(response.json()["job_id"])
        self.assertEqual(job["filename"], filename)
        self.assertEqual(job["analysis"]["status"], "complete")


if __name__ == "__main__":
    unittest.main()
