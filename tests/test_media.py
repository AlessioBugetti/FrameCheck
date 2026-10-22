import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from framecheck.media import MediaError, analyze, check_tools, inspect_media, make_preview, probe
from scripts.generate_samples import EXPECTED, ffmpeg, generate_samples


class MediaTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix="framecheck-media-tests-")
        cls.root = generate_samples(cls.directory.name, matrix=True)

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    async def findings(self, path):
        metadata = await inspect_media(path, path.name)
        return metadata, await analyze(path, metadata)

    def assert_expected(self, findings, *, has_audio=True, shift=0.0):
        expected = [item for item in EXPECTED["findings"] if has_audio or item["type"] != "silence"]
        self.assertEqual(len(findings), len(expected), findings)
        for event in expected:
            matching = [item for item in findings if item["type"] == event["type"] and abs(item["start"] - event["start"] - shift) <= 0.25 and abs(item["end"] - event["end"] - shift) <= 0.25]
            self.assertEqual(len(matching), 1, (event, findings))

    async def test_required_tools(self):
        self.assertEqual(await check_tools(), {"ready": True, "error": None})

    async def test_matrix_with_and_without_audio(self):
        for name in ("demo.mp4", "h264-aac.mov", "h264-aac.mkv", "prores-pcm.mov", "vp9-opus.webm"):
            source = self.root / name
            for path in (source, source.with_name(source.stem + "-no-audio" + source.suffix)):
                with self.subTest(file=path.name):
                    metadata, findings = await self.findings(path)
                    has_audio = "no-audio" not in path.name
                    self.assertEqual(metadata["has_audio"], has_audio)
                    self.assert_expected(findings, has_audio=has_audio)
                    self.assertEqual(metadata["requires_preview"], name == "prores-pcm.mov")

    async def test_normal_sample_has_no_findings(self):
        _, findings = await self.findings(self.root / "normal.mp4")
        self.assertEqual(findings, [])

    async def test_preview_preserves_events_for_every_matrix_row(self):
        names = ("demo.mp4", "h264-aac.mov", "h264-aac.mkv", "prores-pcm.mov", "vp9-opus.webm")
        names += tuple(Path(name).stem + "-no-audio" + Path(name).suffix for name in names)
        for name in names:
            with self.subTest(file=name):
                source = self.root / name
                metadata, original = await self.findings(source)
                output = self.root / f"{source.stem}-preview.mp4"
                await make_preview(source, output, metadata)
                preview, findings = await self.findings(output)
                self.assertEqual(metadata["has_audio"], preview["has_audio"])
                self.assertLessEqual(abs(preview["duration"] - metadata["duration"]), 0.1)
                for kind in ("black_frames", "silence"):
                    before = [item for item in original if item["type"] == kind]
                    after = [item for item in findings if item["type"] == kind]
                    self.assertEqual(len(before), len(after))
                    for a, b in zip(before, after):
                        self.assertAlmostEqual(a["start"], b["start"], delta=0.1)
                        self.assertAlmostEqual(a["end"], b["end"], delta=0.1)

    async def test_shared_offset_variable_rate_and_delayed_audio(self):
        base = self.root / "demo.mp4"
        cases = {
            "offset.mkv": ["-i", base, "-c", "copy", "-output_ts_offset", "5"],
            "variable.mkv": ["-i", base, "-vf", "select='gte(t,6)+not(mod(n,2))'", "-fps_mode", "vfr", "-c:v", "libx264", "-threads", "4", "-preset", "veryfast", "-crf", "18", "-c:a", "copy"],
            "delayed.mkv": ["-i", base, "-itsoffset", "1", "-i", base, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy"],
        }
        for name, arguments in cases.items():
            with self.subTest(file=name):
                source = self.root / name
                ffmpeg([*arguments, source])
                metadata, original = await self.findings(source)
                self.assertLess(metadata["duration"], 13.1)
                if name == "offset.mkv":
                    self.assertTrue(metadata["requires_preview"])
                    self.assert_expected(original)
                if name == "delayed.mkv":
                    silence = next(item for item in original if item["type"] == "silence")
                    self.assertAlmostEqual(silence["start"], 10, delta=0.1)
                output = self.root / f"{source.stem}-preview.mp4"
                await make_preview(source, output, metadata)
                _, findings = await self.findings(output)
                for kind in ("black_frames", "silence"):
                    before = [item for item in original if item["type"] == kind]
                    after = [item for item in findings if item["type"] == kind]
                    self.assertEqual(len(before), len(after))
                    for a, b in zip(before, after):
                        self.assertAlmostEqual(a["start"], b["start"], delta=0.1)
                        self.assertAlmostEqual(a["end"], b["end"], delta=0.1)

    async def test_terminal_black_freeze_and_silence_reach_stream_end(self):
        source = self.root / "terminal.mp4"
        ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=5", "-f", "lavfi", "-i", "sine=frequency=440:duration=5", "-vf", "drawbox=color=black:t=fill:enable='gte(t,2)'", "-af", "volume=0:enable='gte(t,2)'", "-c:v", "libx264", "-threads", "4", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", source])
        metadata, findings = await self.findings(source)
        self.assertEqual({item["type"] for item in findings}, {"black_frames", "frozen_frames", "silence"})
        for item in findings:
            self.assertAlmostEqual(item["start"], 2, delta=0.1)
            self.assertAlmostEqual(item["end"], metadata["audio_end"] if item["type"] == "silence" else metadata["video_end"], delta=0.02)

    async def test_full_clip_events_begin_at_zero(self):
        source = self.root / "all-black.mp4"
        ffmpeg(["-f", "lavfi", "-i", "color=black:size=160x90:rate=30:duration=3", "-f", "lavfi", "-i", "anullsrc=sample_rate=48000:channel_layout=stereo", "-t", "3", "-c:v", "libx264", "-threads", "4", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", source])
        metadata, findings = await self.findings(source)
        self.assertEqual({item["type"] for item in findings}, {"black_frames", "frozen_frames", "silence"})
        for item in findings:
            self.assertAlmostEqual(item["start"], 0, delta=0.02)
            self.assertAlmostEqual(item["end"], metadata["audio_end"] if item["type"] == "silence" else metadata["video_end"], delta=0.02)

    async def test_unsupported_inputs_have_specific_errors(self):
        cases = []
        invalid = self.root / "invalid.mp4"
        invalid.write_text("This is not a video.")
        cases.append((invalid, "decode_failed"))
        avi = self.root / "unsupported.avi"
        ffmpeg(["-i", self.root / "demo.mp4", "-t", "1", "-c", "copy", avi])
        cases.append((avi, "unsupported_container"))
        codec = self.root / "mpeg4.mp4"
        ffmpeg(["-i", self.root / "demo.mp4", "-t", "1", "-c:v", "mpeg4", "-c:a", "copy", codec])
        cases.append((codec, "unsupported_codec"))
        tracks = self.root / "tracks.mp4"
        ffmpeg(["-i", self.root / "demo.mp4", "-map", "0:v", "-map", "0:a", "-map", "0:a", "-c", "copy", tracks])
        cases.append((tracks, "unsupported_tracks"))
        for path, code in cases:
            with self.subTest(file=path.name), self.assertRaises(MediaError) as error:
                await inspect_media(path, path.name)
            self.assertEqual(error.exception.code, code)

    async def test_probeable_damaged_payload_fails_analysis(self):
        source = self.root / "demo.mp4"
        result = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_packets", "-show_entries", "packet=pos,size", "-of", "json", str(source)], capture_output=True, text=True, check=True)
        packet = json.loads(result.stdout)["packets"][150]
        damaged = bytearray(source.read_bytes())
        position = int(packet["pos"])
        damaged[position:position + 4] = b"\x7f\xff\xff\xff"
        path = self.root / "damaged.mp4"
        path.write_bytes(damaged)
        metadata = await inspect_media(source, source.name)
        self.assertTrue((await probe(path))["streams"])
        with self.assertRaises(MediaError) as error:
            await analyze(path, metadata)
        self.assertEqual(error.exception.code, "decode_failed")

    async def test_duration_and_file_size_boundaries(self):
        for duration in (300, 301):
            path = self.root / f"duration-{duration}.mp4"
            ffmpeg(["-f", "lavfi", "-i", f"testsrc2=size=16x16:rate=1:duration={duration}", "-c:v", "libx264", "-threads", "4", "-preset", "veryfast", "-pix_fmt", "yuv420p", path])
            if duration == 300:
                self.assertAlmostEqual((await inspect_media(path, path.name))["duration"], 300)
            else:
                with self.assertRaises(MediaError) as error:
                    await inspect_media(path, path.name)
                self.assertEqual(error.exception.code, "video_too_long")
        large = self.root / "too-large.mp4"
        with large.open("wb") as handle:
            handle.truncate(500_000_001)
        with self.assertRaises(MediaError) as error:
            await inspect_media(large, large.name)
        self.assertEqual(error.exception.code, "file_too_large")
        boundary = self.root / "size-limit.mp4"
        boundary.write_bytes((self.root / "demo.mp4").read_bytes())
        with boundary.open("r+b") as handle:
            handle.truncate(500_000_000)
        self.assertAlmostEqual((await inspect_media(boundary, boundary.name))["duration"], 12, delta=0.1)


if __name__ == "__main__":
    unittest.main()
