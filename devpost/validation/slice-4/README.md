# Slice 4 — Complete workflow validation

Measured on 22 October 2026 on this Linux machine with Python 3.12, Node.js 24, FFmpeg 6.1.1 and installed Chrome 155. All media used here are synthetic.

## Final checks

- Complete backend suite: **30 passed in 24.752 seconds**. Covers matrix/audio/timestamps, exact 300-second and 500,000,000-byte inspection boundaries and rejection beyond them, streamed overflow/disconnect/incomplete upload, storage errors, low free disk, cleanup, corruption, preview output cap, timeout and real child-process cancellation/reaping.
- Frontend unit suite: **nine passed**; production TypeScript/Vite build passed.
- Complete ordinary Chrome suite: **26 passed in 52.2 seconds**; the optional large-fixture case is explicitly skipped without its environment variable. Includes a complete demo using only Tab and Enter, real detection/frames/ranges, all codec rows with/without audio, decisions/filters, original/preview fallback, empty/error/reload states, stale polling after reset, safe offline reports and print output.
- Optional near-limit Chrome case passed separately in **54.7 seconds**, after dense-fixture generation/checking. That run passed both dense and near-limit cases (two passed in one minute).
- After the final empty-state wording refinement, the affected normal/no-audio/dense Chrome cases passed again (three passed in 12.6 seconds). Build and nine unit tests also passed again. No backend changes followed its final suite.

`backend-tests.txt` and `browser-tests.txt` preserve the complete-suite outputs. A deliberately corrupt-video error in the browser log is an expected test input, not a failed test.

## Five-minute / 500 MB evidence

The real HTTP performance script generated and uploaded **482,835,070 bytes** of 1920×1080, 30 fps H.264/AAC video with normalized duration **299.955273 seconds**. No suspicious intervals were detected in this continuous-motion/audio workload.

| Phase | Observed seconds |
| --- | ---: |
| Streamed HTTP upload | 0.636 |
| Inspection, approximately | 0.205 |
| Original analysis, approximately | 11.938 |
| Upload through successful analysis | 12.778 |
| Compatible preview, including output inspection | 38.492 |

The preview was 185,836,521 bytes. Phase times use 100 ms status polling; they are measurements, not user-facing guarantees. `performance.json` contains the full result. The same-size native browser upload, original analysis and real generated-preview path passed the optional Chrome case.

The browser compared decoded original/preview frames at **1, 149.8 and 298.8 seconds**. Maximum presented-time difference was **0.025065 seconds**, within the 0.10-second contract. Mean RGBA pixel differences on 96×54 samples were 0.080, 1.424 and 0.088 (out of 255); the corresponding moving images agree. See `browser-performance.json`. Earlier offset, VFR and delayed-audio checks remain in slice 1.

The initial browser harness intercepted requests before a 482 MB upload and stalled; moving media interception until after native upload acceptance resolved it. Tracing/intercepting this large body is not part of production behavior. The separate HTTP benchmark and corrected browser case both passed without reducing the app's limits.

## Dense review, keyboard and visual inspection

The two-minute fixture produces **57 findings**: 30 Black frames, 15 Frozen frames and 12 Silence. The generator applies black intervals after the freeze filter so the synthetic effects do not erase each other.

- Short black intervals retain a true visual duration of approximately 0.6 seconds; their pseudo-element click target is at least 28 px wide. At high density those targets can overlap, so the precise chronological panel remains available.
- Individual selection from the panel works by keyboard, pauses and seeks, and highlights the matching timeline interval. The selected entry scrolls inside its list without moving the player/page.
- Type, timestamps, review-progress and all three decision-label text colors exceed 4.5:1 against their rendered backgrounds in the checked states. Focus has a visible outline. This is focused contrast evidence, not a full assistive-technology audit.
- Desktop and 390 px layouts were inspected in `dense-desktop.png` and `dense-narrow.png`: the panel is scrollable on desktop and stacks below the player/timeline on narrow screens, without horizontal overflow. Selected and Problematic states retain labels as well as color.
- `demo-complete.png` and `demo-rehearsal.json` record the keyboard-only load/review/export path. The automated interaction time is not a human narration estimate; README supplies a suggested 1–3 minute recording sequence.

## Reproduce

From the repository root, with dependencies installed and port 8766 free:

```bash
.venv/bin/python -m unittest discover -s tests -v
npm --prefix frontend test -- --run
npm --prefix frontend run build
npm --prefix frontend run test:e2e
.venv/bin/python scripts/validate_performance.py --output /tmp/framecheck-performance
FRAMECHECK_PERFORMANCE_FIXTURE=/tmp/framecheck-performance/near-limit.mp4 npm --prefix frontend run test:e2e -- performance.spec.ts --trace off
```

Large generated files remain in the supplied temporary output directory for inspection and are not committed. Normal app reset/shutdown cleans its own job directory. Browser tests use port 8766 and do not reset the user's review on 8765.

## Remaining limits and human checks

The evidence supports retaining five minutes/500 MB for this proof of concept. It does not measure every codec/resolution at the limit, real customer recordings, HDR fidelity, other operating systems or other browsers. Representative personal footage, native print-dialog preview, final learner exploration/readiness and the learning wrap-up remain pending. No public repository or submission video has been published.
