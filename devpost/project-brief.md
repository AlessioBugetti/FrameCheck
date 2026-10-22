---
doc: project-brief
status: reference
---

# FrameCheck — Check a Video Before Delivering It

User-supplied product brief, recorded as planning input. Scope, product requirements, and technical specification will be developed and reviewed through the Devpost Learn workflow.

Approved amendment: the learner subsequently replaced the MP4-only boundary with MP4, MOV, MKV, and WebM using a minimal tested container/codec matrix, duration and size limits, and local browser-compatible previews when required. Analysis uses the original and review timestamps must remain aligned. All other boundaries were confirmed. See [the approved scope](scope.md), which takes precedence; the original brief below is retained as source context.

## The Problem

A video processing job can complete successfully while producing a file with black intervals, unexpectedly frozen images, or prolonged silence. Finding these moments manually requires watching the output.

## The Product

Build a small app for people reviewing processed videos before delivery.

The core journey is:

1. Upload a video.
2. Analyze it for potential issues.
3. Review findings on a timeline synchronized with a video player.
4. Mark each finding as intentional or problematic.
5. Download a review report.

## Core Behavior

- Detect black intervals, frozen images, and prolonged silence using FFmpeg.
- Show each finding’s type, start time, end time, and duration.
- Let users filter findings by type.
- Clicking a finding should seek the player slightly before its start, so users can understand the context.
- Give findings three review states: unreviewed, intentional, and problematic.
- Show a compact summary of findings and review progress.
- Export a readable report containing the filename, detection settings, findings, timestamps, and review decisions.

Treat detections as candidates for human review, not proof of a defect. Static scenes and silence can be intentional. A video without an audio track should be identified as such, rather than reported as one long silence.

## Proof-of-Concept Boundary

- One video at a time.
- Short MP4 videos with explicitly documented duration and size limits.
- A local app with local processing.
- No accounts, billing, cloud storage, collaboration, or video repair.
- No external AI service unless a concrete need is identified.
- Choose simple, documented detection thresholds. Avoid a large settings panel.
- Keep review state for the current session; cross-session persistence is outside the initial scope.

## User Experience

Make the upload, analysis, review, and export steps feel coherent and clear. Include useful processing feedback, understandable errors, an empty state, and a successful analysis state with no findings. Keep review controls keyboard accessible and do not communicate issue types through color alone.

## Demo and Validation

Create a short synthetic sample video with known black, frozen, and silent intervals. Make it easy to try this sample in the app.

Use it to verify that detections approximately match the expected intervals, timeline navigation works, and exported review decisions are accurate. Include a normal sample to check that the app does not simply flag everything.

The 1–3 minute demo should show the complete journey from loading the sample to reviewing the three issue types and downloading the report.

## Planning Sequence

Use this brief to inform the interview, scope, PRD, and technical specification before implementation. Preserve the required planning documents in `devpost/`.
