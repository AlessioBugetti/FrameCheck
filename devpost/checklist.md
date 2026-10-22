---
doc: checklist
status: approved
---

# FrameCheck — Build Checklist

Build mode: Fast. The learner explicitly switched from learn mode to fast mode during slice 1. Mechanically verify and commit each slice; pause for the planned early workspace feedback and final review. Keep explanations concise and focused on decisions.

Prerequisites: Scope, PRD, technical specification, and build order are approved. Local Git initialization is authorized. Preserve existing ignore rules for the learner profile and credentials, add generated/runtime exclusions as needed, and inspect every staged diff. No remote publication is part of this build.

We will build small, usable increments. Each step crosses the necessary layers, exposes a behavior the learner can try, and passes its checks before the next step starts. Media compatibility and timestamp checks come first within the first slice, because the entire review experience depends on them.

## Slices

- [x] **1. Load a video and inspect real findings in a playable workspace**
  Becomes usable: The local app accepts an upload or the synthetic demo, analyzes the original, prepares a preview when necessary, and presents chronological findings beside a player and three-track timeline. Selecting a finding pauses and seeks to its context. Normal/no-audio outcomes, unsupported input, processing feedback, and separate analysis/playback errors are visible.
  Why now: Proves the distinctive detection-to-review path immediately and resolves codec/timestamp risks before extending review behavior. Dependency setup and scaffolding belong to this working path.
  PRD ref: `prd.md > The Core Journey`, `Video Intake and Limits`, `Analysis and Compatible Preview`, `Timeline and Playback`, `Screens and Layout`, `Look and Feel`
  Spec ref: `spec.md > Stack`, `Where It Runs and How Someone Tries It`, `Media Support Matrix`, `Timestamp and Duration Contract`, `Local API and Job Lifecycle`, `Media Inspection and Detection`, `Playback Readiness and Preview`, `Review Workspace and Navigation`
  Build: Set up pinned Python/frontend dependencies and the production startup path. Promote the preflight into backend tests and deterministic sample generation with expected intervals. Implement bounded streamed uploads, one-job lifecycle/reset/cleanup, strict original decoding, normalized timestamps, final detection settings, progress, preview fallback, range-serving, and browser frame readiness. Build the English graphite initial/processing/review views, player, labeled timeline, findings list and paused selection. Preserve successful analysis through preview/browser failures. Include demo.mp4 and normal.mp4; generate larger validation media outside Git.
  Verify (mechanical): Run `.venv/bin/python -m unittest discover -s tests -v` for parser/EOF/overlap behavior, five audio-bearing and five no-audio matrix cases, normal samples, unsupported/corrupt inputs, shared offsets/VFR/delayed audio, upload bounds and cleanup. Run `npm --prefix frontend run build` and the intake/playback Playwright checks against installed Chrome and the actual local server. Confirm known detections within 0.25 seconds, preview landmarks within 0.10 seconds, HTTP 206 and seeking beyond initial buffering, paused context seeking, single-job conflicts, and reload/reset recovery. Capture the rendered workspace and inspect the player/timeline balance. Record actual outcomes, not inferred compatibility.
  Learner check: Start the documented local server, open `http://127.0.0.1:8765`, choose Try the demo, and select one finding of each type. Try a supported MOV or WebM if available. Check whether the layout, finding density, selected interval, and playback context are clear; report anything confusing before the review controls are completed.
  Commit: `feat: analyze videos in a review workspace`

- [x] **2. Classify findings and navigate remaining review work**
  Becomes usable: Mark findings Intentional or Problematic, restore Unreviewed, filter by type/status, and use Next unreviewed with forward search and wraparound. Overall review progress stays accurate and navigation remains deliberate.
  Why now: Adds human judgment to the validated media path and incorporates early workspace feedback before report generation depends on the decision state.
  PRD ref: `prd.md > Findings, Filters, and Review Decisions`, `Timeline and Playback`, `Language and Terminology`, `Accessibility and Responsive Review`
  Spec ref: `spec.md > Review Workspace and Navigation`, `Data Model and HTTP Contract`, `Look and Feel`
  Build: Add the session decision map, shared labels/time formatting, compact filters/progress, selected-finding actions, retained chronological navigation position and explicit continuation. Clear filtered-out selection without moving playback; pause as specified. Keep decisions explicit when playback is unavailable, disable playback-dependent navigation, and distinguish empty filters from no findings. Make controls keyboard accessible with visible focus and neutral/amber/red decision labels.
  Verify (mechanical): Run `npm --prefix frontend test -- --run` for filtering, stable ordering, all decision transitions, global counts, forward/wrapping Next unreviewed, and empty-match behavior. Run the review-loop Playwright checks against Chrome: selection seeks once and pauses; decisions never auto-advance; filtered-out selection clears while currentTime is preserved; Next respects both filters; controls have accessible names and visible focus. Rebuild the frontend and complete a keyboard-only demo review.
  Learner check: Filter to Unreviewed, classify a selected finding, and confirm that it disappears without seeking elsewhere. Use Next unreviewed, try a type filter, and restore a reviewed finding to Unreviewed. Check that the selected interval, current decision, and remaining work are always apparent.
  Commit: `feat: add deliberate finding review`

- [ ] **3. Export an accurate offline review report**
  Becomes usable: Export report downloads a readable, printable HTML file with the original filename, exact settings, all findings and current decisions, including incomplete reviews and playback failures.
  Why now: Completes the core journey using the established analysis and decision models; the report must faithfully preserve the review rather than reconstruct it from filtered UI entries.
  PRD ref: `prd.md > Standalone HTML Report`, `Language and Terminology`, `Analysis and Compatible Preview`, `States and Boundaries`
  Spec ref: `spec.md > HTML Report`, `Playback Readiness and Preview`, `Data Model and HTTP Contract`
  Build: Generate a self-contained HTML document with native DOM text insertion, shared terminology/timestamps, embedded screen/print styles and a downloadable Blob. Include all findings regardless of filters, overall progress, actual settings, no-audio/no-findings outcomes, and server/client playback status. Enable export immediately after successful analysis even while playback is pending or unavailable; keep unclassified findings Unreviewed.
  Verify (mechanical): Run frontend unit tests and export Playwright checks. Export a mixture of all three decisions under an active filter and compare every row/count with source state. Force server preview failure and browser failure after a successful transcode; verify preserved analysis, truthful UI/report disclosure, disabled playback controls and unchanged decisions. Also export during pending readiness and with zero findings/no audio. Verify hostile filenames render as text, the report opens with network access blocked, and print media has no clipped columns or missing rows. Inspect browser print preview.
  Learner check: Review two demo findings differently, leave another Unreviewed, apply a filter, and export. Open the downloaded HTML offline and its print preview; check that it includes the full analysis and exactly the decisions you made.
  Commit: `feat: export offline HTML review reports`

- [ ] **4. Validate demanding cases and polish the complete demo**
  Becomes usable: A coherent, documented proof of concept with verified limits/errors, readable dense findings, responsive keyboard-accessible review, and a reproducible 1–3 minute demonstration journey.
  Why now: The whole workflow exists, so final measurements and presentation checks exercise the actual product rather than disconnected components. This step closes required validation gaps without adding features.
  PRD ref: `prd.md > Accessibility and Responsive Review`, `States and Boundaries`, `Look and Feel`, `What We're Building`, `Decisions and Validation for the Technical Specification`
  Spec ref: `spec.md > Verification and Build Order`, `Evidence, Simplifications, and Open Issues`, `Local API and Job Lifecycle`, `Look and Feel`, `Where It Runs and How Someone Tries It`
  Build: Generate a dense findings fixture and refine timeline hit targets, panel spacing and small-screen layout based on rendered evidence. Complete actionable error/recovery copy and resource safeguards. Document installation, exact support matrix, detector limits, session lifetime, temporary-file cleanup and the demo sequence in README.md. Record actual application performance on the near-five-minute/500 MB workload, including upload/probe/analysis/preview. Keep broader codec/resolution claims bounded by tests.
  Verify (mechanical): Run the complete backend, frontend and Chrome suites and production build. Exercise exact size/duration acceptance and rejection boundaries, partial uploads, timeout/output-limit/disk failure paths, subprocess cancellation and stale responses. Repeat the near-limit measurement through the real app and compare start/middle/end playback landmarks. Inspect desktop and narrow layouts, short/overlapping intervals and dense findings; complete keyboard navigation and verify visible focus/contrast. Run the README startup instructions and rehearse loading the demo, reviewing all three finding types, and exporting within the intended recording sequence. Save evidence and state unresolved limitations explicitly.
  Learner check: Follow the README from startup, explore the complete app freely, and try your own representative short videos. Review the demo, a normal file and dense findings. Report anything broken, confusing, or worth changing, then retry the agreed corrections before declaring the proof of concept ready.
  Commit: `test: validate and polish the demo workflow`

## Hands-on Checkpoints

Slice 1 is implemented and mechanically verified: 26 backend tests, two frontend unit tests, the production build, and 16 distinct Chrome integration cases passed. See [the evidence](validation/slice-1/README.md). The app is available at http://127.0.0.1:8765 for the early hands-on check. The learner explicitly requested continuation on 22 October without supplying hands-on observations. The early feedback pause is deferred to final exploration; no learner testing is claimed. Review decisions and filters are verified in slice 2; offline HTML export is verified in slice 3.

- [ ] Early usable behavior explored — deferred to final exploration at the learner’s explicit continuation request; no hands-on feedback has been supplied.
- [ ] Final kick-the-tires exploration and feedback completed — after slice 4, learner tries the full workflow and any agreed corrections.

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship.

## Code Tour and App Map

- [ ] Learning activity complete — use the actual original/preview timestamp path and one test to explain how the plan became a verifiable implementation; adapt if useful practice already occurred.
- [ ] Optional edit and transfer reflection addressed — offered, declined, already covered, or not applicable as appropriate.
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse.

Activity and evidence: Not started. Record actual code/test references and learner participation after final review.
Route and stops: Choose actual symbols from the implemented media pipeline, playback selection and alignment test; no completed route is claimed.
Edit outcome: Not offered yet.
Reflection: Not offered yet; personal answers belong in the ignored learner profile.
Activity mode: Planned focused investigation suited to the learner's engineering experience.

## Revisions

- Changed the local app port from 8000 to 8765 because another service already occupied 8000; startup instructions, development proxy and origin checks agree. Browser tests use a separate server on 8766 so they cannot reset a user's review.
- Added a bounded next-packet timestamp fallback for missing AAC packet duration after the delayed-audio fixture exposed an omitted priming-packet duration. Unresolved final durations remain unsupported.
- Added failure detection from FFmpeg's level-tagged diagnostics after a damaged H.264 fixture returned exit code zero despite decoder errors with `-xerror` enabled.
- Located browser tests and their configuration inside `frontend/` so they resolve the existing npm dependencies without a second package or root dependency tree.

- The learner authorized continuation after the early workspace checkpoint; defer unperformed hands-on feedback to final exploration rather than inventing feedback or repeating the permission gate.

## Session Checkpoint — 22 October 2026

The learner requested continuation after the usage window renewed (1% used at resume). The stop rule remains 99% used. No reset credit was spent by the agent.

Slice 1 is committed as `64c3e45`. Slice 2 now passes its six unit tests, production build and three focused Chrome cases, including playback-unavailable classification. Desktop and narrow screenshots are inspected; evidence is in `validation/slice-2/README.md`. The early hands-on check remains deferred by the learner; final exploration is still required.

- Slice 3 validates printing through Chrome’s print engine and inspection of every rendered PDF page. Native print-dialog UI inspection remains part of final learner exploration; no such inspection is claimed.
