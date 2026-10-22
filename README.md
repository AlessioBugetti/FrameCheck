# FrameCheck

Check a processed video before delivering it. FrameCheck analyzes the original locally and presents candidate black frames, frozen frames and silence beside a synchronized player and timeline. Findings require human judgment; they are not confirmed defects.

## Review workflow

Upload, the synthetic demo, real FFmpeg analysis, compatible previews, paused finding selection, type/status filters, explicit review decisions and Next unreviewed are implemented. Export report downloads a standalone, offline, printable HTML review, including unreviewed findings and playback failures.

Select a finding to pause and seek one second before it starts. Watch it, choose **Mark as intentional** or **Mark as problematic**, then choose **Next unreviewed** when ready. Restore **Unreviewed** whenever needed. Decisions apply immediately without advancing playback. Filters affect the list, timeline and next destination; overall progress and reports always cover every finding. Next searches forward and wraps, retaining its position when classification removes the selected entry.

Export is available as soon as analysis succeeds, including while playback is pending or unavailable. It preserves explicit decisions and identifies every remaining Unreviewed finding. Print the downloaded HTML using the browser’s Print command. [Build and review progress](devpost/checklist.md).

For source navigation, key design decisions and where to make changes, open the standalone [app map](devpost/app-map.html). It works offline with scripts disabled.

## Run locally

Tested on Linux with Python 3.12, Node.js 24, FFmpeg/ffprobe 6.1.1 and Google Chrome 155. Install native FFmpeg with H.264, ProRes, VP9, AAC, PCM and Opus decoders, libx264/AAC encoders, and the blackdetect/freezedetect/silencedetect/metadata filters. Chrome is the first supported browser.

From this project directory:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm --prefix frontend ci
npm --prefix frontend run build
.venv/bin/python -m uvicorn framecheck.server:app --host 127.0.0.1 --port 8765 --workers 1
```

Open **http://127.0.0.1:8765** in Chrome. Choose **Try the demo** or **Upload video**. Select a finding from the list or timeline: the player pauses and seeks one second before the interval. Use the player's controls to watch it. **New video** clears the current job.

Use one Uvicorn worker: the current job lives in that process. The server binds only to loopback. Stop it with Ctrl+C. During interface development, run `npm --prefix frontend run dev` alongside the backend; Vite proxies `/api` to port 8765. Rebuild the interface and reload to see interface changes. Reloading discards in-memory decisions; export first. If the server started before a build existed, restart it after the initial build.

## Supported media

Maximum **five minutes (300 seconds)** and **500 MB (500,000,000 bytes)** per video. File contents and codecs are inspected; an accepted extension alone does not establish support. One video track and zero or one audio track are supported. Subtitle/data streams are ignored and disclosed. Multiple playable tracks receive a clear rejection.

| Container | Video | Audio |
| --- | --- | --- |
| MP4 | H.264, 8-bit 4:2:0 | AAC-LC or none |
| MOV | H.264, 8-bit 4:2:0 | AAC-LC or none |
| MOV | ProRes 422 standard, yuv422p10le | PCM s16le or none |
| MKV | H.264, 8-bit 4:2:0 | AAC-LC or none |
| WebM | VP9 profile 0, 8-bit 4:2:0 | Opus or none |

Analysis always uses the original. ProRes and materially offset source timelines use a local H.264/AAC MP4 preview; other inputs attempt direct playback and fall back once if the browser cannot present a frame. A file without audio stays without audio and displays **No audio track**. Preview or browser playback failure preserves successful analysis and disables playback navigation.

HEVC, AV1, VP8, other audio codecs and other ProRes profiles are outside this initial matrix. HDR fidelity is not promised. Unusual or missing timestamps can produce an unsupported-timing error rather than an unreliable review timeline.

## Detection and timing

| Type | Fixed FFmpeg settings |
| --- | --- |
| Black frames | Minimum 0.5 seconds, picture ratio 0.98, pixel threshold 0.10 |
| Frozen frames | Minimum 1 second, noise threshold −60 dB |
| Silence | Minimum 2 seconds, noise threshold −40 dB, combined channels |

The exact filter strings live in `framecheck/detection.py`. Black and frozen findings may overlap. Static scenes, fades and silence can be intentional; successful empty analysis displays **No suspicious intervals detected**.

Analysis and previews share `-copyts -start_at_zero` normalization. Duration comes from selected packet presentation ends, not container duration alone. An AAC packet missing its duration can use the next audio packet's timestamp when the gap is positive and at most 0.1 seconds; an unresolved final duration is rejected. Preview generation preserves variable timing and checks output duration within 0.1 seconds. Both process exit status and tagged decoder errors must be clean before analysis succeeds.

## Samples and tests

Small synthetic samples are included in `samples/`. The demo has black frames at 2–3 seconds, frozen frames near 6–8 seconds, and silence near 9–11.5 seconds. The black interval also produces a frozen-frame candidate. `samples/expected.json` records those expectations. `normal.mp4` has continuous movement and audio.

Regenerate them with the command below; the generator also needs FFmpeg's drawtext filter and DejaVu fonts:

```bash
.venv/bin/python scripts/generate_samples.py
.venv/bin/python -m unittest discover -s tests -v
npm --prefix frontend test -- --run
npm --prefix frontend run build
npm --prefix frontend run test:e2e
```

Browser tests launch installed Chrome and their own server on **8766**, separate from your review on 8765. They generate temporary matrix fixtures and remove them afterward. Do not run a second server on that test port. The backend suite tests all five matrix combinations with and without audio, previews, EOF intervals, source offsets, variable frame rate, delayed audio, corruption, upload/cancellation cleanup, and size/duration boundaries. Browser checks verify actual frames, context seeking, fallback failure, deliberate decisions/filters, offline reports, print output, keyboard-only demo navigation, stale responses, dense findings, contrast, and the narrow layout. Test output and traces are ignored by Git.

Generate additional stress media outside the repository:

```bash
.venv/bin/python scripts/generate_samples.py --dense --output /tmp/framecheck-samples
.venv/bin/python scripts/validate_performance.py --output /tmp/framecheck-performance
FRAMECHECK_PERFORMANCE_FIXTURE=/tmp/framecheck-performance/near-limit.mp4 npm --prefix frontend run test:e2e -- performance.spec.ts --trace off
```

The performance script reserves port 8766 and refuses to use an existing server. It generates a roughly 483 MB, nearly five-minute 1080p30 file, sends it through the real HTTP pipeline, requests a preview, saves measurement JSON and the preview, and stops its server. Large test media remain in your chosen temporary directory for inspection; remove that directory when finished. The browser performance case is explicitly skipped by the ordinary suite when the environment variable is absent. Avoid tracing/intercepting the large upload itself: it adds test-harness buffering. Media interception in this test begins only after upload acceptance.

The two-minute dense fixture contains 30 Black frames, 15 Frozen frames and 12 Silence candidates. Its small visual intervals keep their real duration; the findings panel provides precise access when timeline hit areas overlap. No timeline zoom or editing is included.

Detailed measured results and limitations are recorded in [the validation notes](devpost/validation/README.md).

## Session and resource limits

No accounts, cloud services, external AI, database, or persistent review history are used. The backend stores an app-owned temporary copy and optional preview under the system temporary directory in a `framecheck-*` folder. Reset and normal server shutdown cancel active work and delete those files. Reloading the browser offers **Reset current job**; it does not restore review decisions. A process crash can leave temporary files: after stopping FrameCheck, remove only its identified temporary job folders if cleanup is needed.

Inspection is bounded to 30 seconds; analysis and preview each to 10 minutes. Preview output is bounded to 1 GB, four codec threads are requested, and a new job requires 2 GB of free temporary space. These protect the local proof of concept and are not processing-time guarantees. Initial measurements used synthetic 1080p material; larger resolutions and real recordings still need representative performance testing.


## Measured workload

On this machine, a synthetic 482.8 MB, 299.955-second 1080p30 H.264/AAC video completed upload and original analysis in **12.8 seconds**, followed by a compatible preview in **38.5 seconds**. Chrome original/preview frame timestamps at the start, middle and end differed by at most **0.0251 seconds**. The dense review fixture produced 57 findings and passed desktop/narrow selection and focused contrast checks. These measurements support the initial limits for this workload; real recordings, other resolutions/codecs at maximum size, HDR, browsers and operating systems still need representative validation. [Complete evidence](devpost/validation/slice-4/README.md).

## Suggested 1–3 minute demo

1. **0:00–0:20 — Problem:** a successful processing job can still contain unwanted black, frozen or silent intervals. Open FrameCheck and choose **Try the demo**.
2. **0:20–0:50 — Locate and watch:** select Black frames at 2–3 seconds. The player pauses at 1 second; play through it. Explain that detections require judgment. The overlapping Frozen frames candidate is expected for a black image that stays unchanged.
3. **0:50–1:20 — Decide:** classify the black interval and its overlapping candidate as Intentional. Select Frozen frames near 6–8 seconds, watch the context, and mark it Problematic. Review Silence near 9–11.5 seconds and mark it Intentional.
4. **1:20–1:45 — Continue deliberately:** show the compact progress and a type/status filter. Restore one finding to Unreviewed if useful, then use **Next unreviewed** to return to it. Decisions never advance automatically.
5. **1:45–2:15 — Deliver the result:** choose **Export report**. Open the standalone HTML and show timestamps, settings, decisions and any remaining Unreviewed entries. Mention offline opening and browser printing.

Use your own explanation and recording. The automated keyboard rehearsal verifies the interaction path; it is not a narrated submission video. A normal sample and your own representative processed recordings are useful final checks before presenting.
