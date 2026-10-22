import unittest

from framecheck.detection import Detector


class DetectorTests(unittest.TestCase):
    def test_overlapping_types_and_stable_order(self):
        detector = Detector()
        for line in (
            "lavfi.black_start=2", "lavfi.freezedetect.freeze_start: 2",
            "lavfi.black_end=3", "lavfi.freezedetect.freeze_end: 3",
            "silence_start: 9", "silence_end: 11.5 | silence_duration: 2.5",
        ):
            detector.feed(line)
        findings = detector.finish(12, 12)
        self.assertEqual([item["type"] for item in findings], ["black_frames", "frozen_frames", "silence"])
        self.assertEqual([item["id"] for item in findings], ["finding-1", "finding-2", "finding-3"])
        self.assertEqual(findings, detector.finish(12, 12))

    def test_open_intervals_close_at_their_own_stream_end(self):
        detector = Detector()
        for line in ("lavfi.black_start=5", "freeze_start: 4", "silence_start: 6"):
            detector.feed(line)
        findings = detector.finish(8, 9)
        self.assertEqual({item["type"]: item["end"] for item in findings},
                         {"black_frames": 8, "frozen_frames": 8, "silence": 9})

    def test_minimum_durations_clipping_and_missing_audio(self):
        detector = Detector()
        for line in ("lavfi.black_start=0", "lavfi.black_end=0.49",
                     "freeze_start: -0.1", "freeze_end: 1.5",
                     "silence_start: 0", "silence_end: 12"):
            detector.feed(line)
        self.assertEqual(detector.finish(1.2, None),
                         [{"id": "finding-1", "type": "frozen_frames", "start": 0.0, "end": 1.2, "duration": 1.2}])

    def test_non_events_and_unpaired_end_are_ignored(self):
        detector = Detector()
        for line in ("frame=120", "black_start: 1 black_end: 2", "silence_end: 8", "freeze_start: 1e999"):
            detector.feed(line)
        self.assertEqual(detector.finish(12, 12), [])

    def test_scientific_timestamps_with_signed_exponents(self):
        detector = Detector()
        detector.feed("silence_start: 2.08333e-05")
        detector.feed("silence_end: 3e+00")
        detector.feed("freeze_start: -2e-05")
        detector.feed("freeze_end: 1.5")
        findings = detector.finish(4, 4)
        self.assertEqual(findings[0]["start"], 0)
        self.assertAlmostEqual(findings[1]["start"], 0.0000208333)
        self.assertEqual(findings[1]["end"], 3)


if __name__ == "__main__":
    unittest.main()
