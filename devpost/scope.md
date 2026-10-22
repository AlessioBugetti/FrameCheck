---
doc: scope
status: approved
---

# FrameCheck

Check a processed video before delivering it: find suspicious intervals, review them in context, and export the decisions.

## The Unique Kernel

A local pre-delivery review loop connects automated detection to human judgment. Black intervals, frozen images, and prolonged silence become timestamped candidates that a reviewer can inspect, classify, and include in a readable report. Detection is a prompt to review, not proof of a defect.

## Who It's For

The person reviewing a processed video before handing it over. A processing job can report success while the output contains unwanted black, frozen, or silent intervals; today the reviewer must watch the output to find them.

## The Core Loop

1. Load one short MP4, MOV, MKV, or WebM within the documented container/codec support matrix, or try the supplied sample.
2. Analyze the original locally with FFmpeg for the three candidate issue types. If the original cannot play directly in the supported browser, generate a compatible local preview.
3. Review timestamped findings on a timeline synchronized with playback of the original or preview, jumping to just before a finding for context. Preview generation preserves correspondence with the original's timeline.
4. Mark findings intentional or problematic; keep pending findings visibly unreviewed.
5. Download a readable report with the filename, detection settings, findings, timestamps, and decisions.

Repeat this loop for each video that needs review before delivery.

## Inspiration & Identity

“FrameCheck — check a video before delivering it.” The experience should make upload, analysis, review, and export feel coherent and clear. Use understandable language and make the difference between a detected candidate and a review decision explicit. The learner's subsequent PRD direction specifies a dark graphite review workspace: player and timeline on the left, compact findings panel on the right, blue selection/navigation, amber unreviewed findings, and red only for problematic findings. All project text is English; the interface and report share the labels **Black frames**, **Frozen frames**, **Silence**, **Unreviewed**, **Intentional**, and **Problematic**. See [the PRD](prd.md) for the detailed behavior and responsive layout.

## Why This Matters to the Learner

The goal is a focused, competitive hackathon project with a clear target user, an easily explained angle, and a complete demonstration of a useful result. Understanding the implementation and explaining its decisions are part of success.

## What "Working" Looks Like

In a 1–3 minute demo, a reviewer loads a synthetic sample with known black, frozen, and silent intervals, sees approximately matching detections, navigates to them in the player, records decisions, and downloads an accurate report.

A normal sample verifies that the app does not simply flag everything. Successful analysis with no findings is a clear outcome, and a video without an audio track is identified as such rather than treated as one long silence. No-findings results make no guarantee that a video is free of all defects.

A minimal, explicitly documented and tested matrix covers common container/codec combinations across MP4, MOV, MKV, and WebM. Validation distinguishes files that FFmpeg can analyze from files the supported browser can play directly. It includes the compatible-preview path, verifies timestamp correspondence with the original, and checks clear errors for unsupported files.

## The POC Boundary

- One short video at a time in MP4, MOV, MKV, or WebM, initially limited to five minutes and 500 MB per video, as specified by the learner during PRD planning. Validate these limits during performance testing. These limits are the primary controls on workload.
- A minimal, documented matrix of common container/codec combinations; accepting a container does not promise support for every codec it can contain.
- Local application and processing, using FFmpeg on the original for black, freeze, and silence detection with simple, documented thresholds.
- A browser-compatible preview generated locally when direct playback is unavailable. Keep the original for analysis and maintain timestamp correspondence so findings remain reviewable. Preview generation is included in the implementation and validation budget.
- Synchronized player, timeline, type/review-status filtering, review decisions, compact findings/progress summary, and standalone, offline, printable HTML report export form one complete review workflow. Export may include unreviewed findings, clearly identified.
- Review state lasts for the current session.
- Useful processing feedback, including preview preparation when required; understandable errors, including unsupported files; an initial empty state; and a completed state with no findings.
- Keyboard-accessible review controls and type labels that do not depend on color.
- A clearly identified synthetic sample accessible from the app, plus a normal sample for validation.

## Later

Cross-session persistence is outside the first version. No additional roadmap is committed.

## Explicitly Cut

- Accounts, billing, cloud storage, and collaboration: unnecessary for proving a local, single-reviewer workflow.
- Video repair: the proof of concept identifies candidates and records judgment; repair would add a separate product responsibility.
- External AI services: no concrete need has been identified for the requested FFmpeg-based checks.
- Batch processing and long-video support: the initial boundary is one short video at a time within explicit duration and file-size limits.
- Universal codec support and containers beyond MP4, MOV, MKV, and WebM: a minimal tested support matrix keeps compatibility work bounded.
- A large detection-settings panel: simple documented thresholds keep the demonstration focused on review.

## Timing and Open Decisions

- Deadline: 24 October 2026; the exact submission time has not been provided.
- Target implementation completion: 21 October 2026, if possible, leaving time for hands-on testing before the deadline. This is a planning target, not a verified completion estimate.
- The time budget must include preview generation, processing feedback and errors, plus validation of playback and timestamp correspondence. Do not treat the preview path as a later enhancement.
- Review planning documents in Markdown in the conversation; no HTML companion is needed.
- The learner specified initial limits (five minutes/500 MB), standalone HTML report format, visual direction, and filter-aware review behavior in PRD planning. The approved technical specification now defines the minimum container/codec matrix, Chrome target, detection thresholds, and timestamp contract. Preliminary performance evidence is recorded; application-level validation remains part of the build.
- Approved by the learner with the multi-container and compatible-preview amendment; all other boundaries were explicitly confirmed. Based on [the supplied brief](project-brief.md), with this approved scope taking precedence over its original MP4-only boundary.
