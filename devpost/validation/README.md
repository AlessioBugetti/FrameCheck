# Media Preflight — 21 October 2026

These are technical-planning experiments using generated synthetic media. They validate proposed media handling before application implementation. The app, its upload handling, and its full review workflow are not implemented or tested by this preflight.

Subsequent application implementation and standalone Chrome results are recorded separately in [Slice 1 — Integrated Validation](slice-1/README.md). The planning measurements below remain historical evidence.

## Environment

- Linux x86-64; Intel Core Ultra 9 285K, 24 logical CPUs; approximately 62 GiB RAM.
- FFmpeg/ffprobe 6.1.1-3ubuntu5, with libx264, ProRes, VP9, AAC, PCM, and Opus support.
- Python 3.12.3 and Node 24.19.0 are installed.
- Google Chrome 155.0.8059.84 is installed but is not exposed through the available browser-control connection.
- Browser smoke checks used the available in-app Chromium 155 browser. Standalone Chrome remains an application-build acceptance check; these results must not be described as a completed standalone Chrome test.

## Codec and Playback Results

The 12-second synthetic source contains black frames at 2–3 seconds, a deliberately frozen interval near 6–8 seconds, and silence near 9–11 seconds. A black interval also produces a frozen-frame candidate. Preserve both findings; do not assume types are mutually exclusive.

| Container | Video / audio | FFmpeg analysis | In-app Chromium playback and seeking |
| --- | --- | --- | --- |
| MP4 | H.264 / AAC | Passed | Passed |
| MOV | H.264 / AAC | Passed | Passed |
| MKV | H.264 / AAC | Passed | Passed |
| MOV | ProRes 422 / PCM s16le | Passed | Failed to present a video frame after seeking; requires preview |
| WebM | VP9 / Opus | Passed | Passed |
| MP4 preview from ProRes | H.264 / AAC | Corresponding events verified | Passed |

Browser checks waited for a presented frame after each seek, checked image content inside the known black/frozen intervals, and successfully invoked playback. Audio decoded-byte counters were nonzero on successful cases; subjective listening was not performed. Metadata loading alone was insufficient evidence of usable video playback.

All five original variants produced the expected detection boundaries within 0.15 seconds using black minimum 0.5 seconds, freeze minimum 1 second/noise -60 dB, and silence minimum 1 second/noise -40 dB. VP9 compression moved the detected freeze start by about 0.14 seconds. The proposed production silence minimum of 2 seconds was separately verified against the MP4 fixture; full matrix tests must use the final settings during the build. See [results.json](results.json).

## Timestamp Alignment

Analysis and preview experiments used the same `-copyts -start_at_zero` normalization. Video and audio were not independently reset to their own first frame, so their relative timing remained intact. Preview generation preserved variable timing using `-fps_mode vfr` and did not trim the source.

| Case | Maximum original-to-preview difference across checked black/silence boundaries |
| --- | --- |
| Nonzero container start | 0.01201 seconds |
| Variable frame rate | 0.01201 seconds |
| Audio delayed relative to video | 0.0007 seconds |

Frozen interval timestamps were recorded as well; the strict comparison in this experiment used black and silence boundaries to avoid confusing compression-sensitive freeze detection with a timeline shift. See [timing-performance.json](timing-performance.json).

A nonzero-start MKV reported `format.start_time=4.979` and `format.duration=17`, while the normalized selected-stream extent was about 12.031 seconds. Therefore `format.duration` alone is not a reliable review-duration or EOF boundary in every supported container. A packet timestamp scan established normalized end times for the selected streams; it took approximately 0.07 seconds on small fixtures and 0.177 seconds on the large fixture. See [duration-scan.json](duration-scan.json).

The build must verify browser seeking against the normalized original/preview timeline, not just compare detection logs. Do not equate this preflight with exhaustive timestamp compatibility, particularly for unusual edit lists or broken timestamps.

## Near-Limit Performance

A repeated synthetic 1920×1080, 30 fps H.264/AAC input measured:

| Measurement | Result |
| --- | --- |
| File size | 482,280,008 bytes (482.28 decimal MB) |
| Container duration | 299.888607 seconds |
| Maximum selected packet end | 299.955273 seconds |
| Analysis wall time | 12.257 seconds |
| Full-resolution H.264/AAC preview wall time | 39.710 seconds |
| Analysis + preview wall time | 51.967 seconds |
| Preview file size | 185,714,818 bytes |

The commands limited codec worker threads to four. Exact FFmpeg-reported peak memory is recorded in [timing-performance.json](timing-performance.json). This repeated synthetic source is not a camera-footage benchmark or a guarantee for every supported resolution/codec. Five minutes and 500 MB are plausible initial limits on this machine; keep one active job, bounded subprocess runtime, and clear failure states.

The fixture intentionally stays just below both limits. It does not test exactly 500,000,000 bytes or the application's future rejection boundaries. Early generation attempts exceeded the size or duration limits and were caught by the harness assertions; their results were not used as successful benchmarks.

## Reproduction

Copy the checked-in scripts to a disposable directory so generated media and logs stay outside the repository:

```bash
mkdir -p /tmp/framecheck-validation
cp devpost/validation/check_media.py devpost/validation/check_timing_performance.py devpost/validation/browser-check.html /tmp/framecheck-validation/
python3 /tmp/framecheck-validation/check_media.py
python3 /tmp/framecheck-validation/check_timing_performance.py
python3 -m http.server 8877 --bind 127.0.0.1 --directory /tmp/framecheck-validation
```

Open `http://127.0.0.1:8877/browser-check.html` in the browser being tested and choose **Run media checks**. Record the browser version and visible results. Stop the local server after testing. Generated outputs can require roughly 1 GB of temporary disk space.

The harnesses use assertions and fail on missing expected intervals, unacceptable alignment, invalid benchmark size/duration, or findings in the normal benchmark. They are preflight evidence, not the final application's test suite.

## Original Build Gates (Preflight Record)

- Standalone Chrome, supported MIME types, and range requests through the actual application server.
- Final detector settings across the whole supported matrix, no-audio input, terminal events, and malformed/unsupported files.
- Original/preview browser alignment at known boundaries, including offset and variable-rate cases.
- Exact upload-size and normalized-duration boundary enforcement, partial uploads, timeout behavior, disk cleanup, and larger-resolution workloads.
- Preview failure after successful analysis, disabled playback-dependent controls, preserved explicit decisions, and truthful HTML export.
- Keyboard access, responsive layout, dense findings, and offline/print report rendering.


## Final Application Validation — 22 October 2026

The original build gates above are retained as preflight history. Application evidence now lives in:

- [Slice 1](slice-1/README.md): real detection, supported matrix with/without audio, EOF/corruption/timing, ranges and browser frames.
- [Slice 2](slice-2/README.md): decisions, filters, deliberate navigation, focus and playback-unavailable review.
- [Slice 3](slice-3/README.md): complete offline HTML exports, safe text, failed/pending playback disclosure and inspected Chrome print output.
- [Slice 4](slice-4/README.md): complete regression results, 57-finding layouts, keyboard demo and measured near-limit application performance/alignment.

Real customer footage, HDR fidelity, other browsers/operating systems and every codec/resolution at maximum duration remain outside the measured evidence. Final learner exploration and native print-dialog inspection are pending. Automated passing checks do not establish that every processed video is defect-free.
