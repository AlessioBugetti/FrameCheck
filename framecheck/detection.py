import math
import re

SETTINGS = {
    "black_frames": {"minimum_duration": 0.5, "picture_black_ratio": 0.98, "pixel_threshold": 0.10},
    "frozen_frames": {"minimum_duration": 1.0, "noise_db": -60},
    "silence": {"minimum_duration": 2.0, "noise_db": -40, "channels": "combined"},
}
VIDEO_FILTER = (
    "blackdetect=d=0.5:pic_th=0.98:pix_th=0.10,"
    "metadata=mode=print:key=lavfi.black_start,"
    "metadata=mode=print:key=lavfi.black_end,freezedetect=n=-60dB:d=1"
)
AUDIO_FILTER = "silencedetect=n=-40dB:d=2"
EVENT = re.compile(r"(lavfi\.black_(?:start|end)|freeze_(?:start|end)|silence_(?:start|end))[:=]\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)")


class Detector:
    def __init__(self):
        self.open = {}
        self.intervals = []

    def feed(self, line):
        for name, value in EVENT.findall(line):
            time = float(value)
            if not math.isfinite(time):
                continue
            kind = "black_frames" if "black_" in name else "frozen_frames" if "freeze_" in name else "silence"
            if name.endswith("start"):
                self.open.setdefault(kind, time)
            elif kind in self.open:
                self.intervals.append((kind, self.open.pop(kind), time))

    def finish(self, video_end, audio_end):
        ends = {"black_frames": video_end, "frozen_frames": video_end, "silence": audio_end}
        intervals = self.intervals + [(kind, start, ends[kind]) for kind, start in self.open.items()]
        findings = []
        for kind, start, end in intervals:
            if ends[kind] is None or end is None:
                continue
            start, end = max(0.0, start), min(end, ends[kind])
            if end - start + 1e-6 < SETTINGS[kind]["minimum_duration"]:
                continue
            findings.append({"type": kind, "start": start, "end": end, "duration": end - start})
        findings.sort(key=lambda item: (item["start"], item["end"], item["type"]))
        return [{"id": f"finding-{index + 1}", **item} for index, item in enumerate(findings)]
