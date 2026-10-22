import asyncio
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from framecheck import media
from framecheck.jobs import JobManager
from framecheck.media import MediaError


class ResourceTests(unittest.IsolatedAsyncioTestCase):
    async def test_low_disk_space_rejects_before_creating_job(self):
        manager = JobManager()
        with patch('framecheck.jobs.shutil.disk_usage', return_value=SimpleNamespace(free=1_999_999_999)):
            with self.assertRaises(MediaError) as error:
                manager.create('video.mp4')
        self.assertEqual(error.exception.code, 'insufficient_space')
        self.assertIsNone(manager.current)

    async def test_cancellation_kills_and_reaps_subprocess(self):
        entered = asyncio.Event()
        pids = []
        def started(line):
            pids.append(int(line))
            entered.set()
        task = asyncio.create_task(media.run_process([sys.executable, '-c', 'import os,time; print(os.getpid(), flush=True); time.sleep(60)'], stdout=started))
        await asyncio.wait_for(entered.wait(), 5)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        with self.assertRaises(ProcessLookupError):
            os.kill(pids[0], 0)

    async def test_preview_output_limit_removes_partial_output_and_keeps_original(self):
        source = Path(__file__).resolve().parents[1] / 'samples/demo.mp4'
        metadata = await media.inspect_media(source, source.name)
        with tempfile.TemporaryDirectory(prefix='framecheck-output-limit-') as directory:
            output = Path(directory) / 'preview.mp4'
            with patch.object(media, 'PREVIEW_MAX_BYTES', 100):
                with self.assertRaises(MediaError) as error:
                    await media.make_preview(source, output, metadata)
            self.assertEqual(error.exception.code, 'preview_too_large')
            self.assertFalse(output.exists())
        self.assertTrue(source.is_file())
