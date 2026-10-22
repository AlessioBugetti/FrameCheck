# Slice 1 — Integrated Validation

The first increment implements local intake, original analysis, compatible playback, timeline selection, and finding inspection. Classification, filters and report export are not part of this completed mechanical test scope.

## Environment and commands

Linux; Python 3.12.3; FFmpeg 6.1.1; Node 24.19.0; installed Google Chrome 155. Dependencies are pinned in requirements.txt and frontend/package-lock.json. The installed browser, rather than the in-app Chromium used during planning, ran the integration suite.

```bash
.venv/bin/python -m unittest discover -s tests -v
npm --prefix frontend test -- --run
npm --prefix frontend run build
npm --prefix frontend run test:e2e
```

The browser suite runs a separate one-worker local API on port 8766. It generates temporary matrix fixtures and deletes them afterward. The review app uses port 8765. The sandbox stalled AnyIO worker-thread file operations during API tests; running those same tests outside the sandbox passed. No application workaround was added for that environment restriction.

## Results

- All **26 backend tests passed**. They cover actual detection in all five supported codec/container combinations with and without audio, preview generation for those ten cases, normal media with no findings, beginning/end intervals, shared offsets, VFR, delayed audio, and damaged compressed packets. Exact 300-second acceptance and over-duration rejection were tested. A sparse padded file checks the 500,000,000-byte boundary; this is boundary validation, not a performance measurement.
- API checks cover original byte ranges, conflicting jobs, reload discovery/reset, interrupted uploads, streamed byte overflow, cancellation, local host/origin checks, and preservation of analysis after forced preview failure. Added regressions cover the upload-to-analysis reset race and preservation of long filenames.
- Two frontend unit tests passed for timestamp formatting and context seeking. The production TypeScript/Vite build passed.
- All **16 distinct Chrome integration cases passed**: the initial 15-case suite and a subsequent focused run of the new buffer test plus two regression cases after backend review fixes. These exercised the demo, ten audio/no-audio matrix cases, offset/VFR playback landmarks, normal/corrupt inputs, reload/reset, and browser failure of both original and generated preview. Failed playback retains findings and disables timeline navigation while details remain inspectable.
- A network-controlled test limited the first media response to 64 KB, confirmed less than eight seconds buffered, then sought to 11.8 seconds. Playback fetched further real byte ranges and displayed the expected end-region content.
- The demo produced four candidates: black frames at 2–3 seconds; an overlapping frozen interval at 2–3; frozen frames around 5.967–8; silence around 9.003–11.520. The extra freeze is expected for a static black interval.
- Browser canvas checks confirmed black content inside its expected interval and equivalent frames within the frozen interval. Offset/VFR checks sought to both sides of the black boundaries within 0.1 seconds and to the end region. Backend preview comparisons checked black/audio event boundaries within 0.1 seconds.
- Keyboard Enter selected a finding, paused playback and sought to one second before its start. Desktop and 390-pixel layouts were captured and visually inspected; the narrow layout places findings below player/timeline without horizontal overflow.

## Evidence

- [Initial screen](initial.png)
- [Desktop workspace](workspace.png)
- [Narrow workspace](narrow.png)
- [Backend test output](backend-tests.txt)

## Remaining checks

Hands-on learner feedback is pending. Dense findings, full keyboard traversal/contrast audit, actual-app near-limit performance, broader real recordings, review decisions, filters, and offline/print report export are later checklist work. These results do not establish universal codec support, HDR fidelity, or performance for every resolution.
