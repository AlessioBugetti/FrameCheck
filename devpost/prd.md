---
doc: prd
status: approved
---

# FrameCheck — Product Requirements

A local video review workspace for people checking processed videos before delivery: locate a suspicious interval, watch it, make a decision, and move to the next finding.

Source: [scope.md](scope.md), especially **The Unique Kernel**, **The Core Loop**, and **The POC Boundary**. The learner approved this product definition, including the preview-failure policy and its clarified control/decision behavior.

## The Core Journey

1. Open FrameCheck and choose **Upload video** or **Try the demo**. See the supported containers, the bounded codec support policy, and the five-minute/500 MB limits before loading a file.
2. Receive understandable validation feedback. An accepted file is analyzed locally using the original. If direct browser playback is unavailable, a compatible preview is prepared locally with corresponding timestamps.
3. See distinct analysis and preview-preparation states. Numerical progress appears only where it can be measured reliably.
4. Enter the review workspace with the player, timeline, chronological findings, and overall review progress. No findings and no audio track have explicit, truthful states.
5. Select a finding from the panel or timeline. Playback seeks to approximately one second before its start, clamped to zero, and pauses. The selected interval is clearly identified in both places.
6. Watch the interval, choose **Mark as intentional** or **Mark as problematic**, or restore **Unreviewed**. Decisions take effect immediately; the app does not automatically advance.
7. Use **Next unreviewed** to continue through findings matching the active filters, searching forward and wrapping to the beginning. Review remains under the user's control.
8. Use **Export report** at any point after successful analysis, including with unreviewed findings remaining. Download a readable, standalone HTML report that works offline and supports browser printing.

## Screens and Layout

Source: `scope.md > The Core Loop` and `The POC Boundary`.

- **Initial view:** clear **Upload video** and **Try the demo** actions, supported containers and support limitations, duration and file-size limits.
- **Processing view:** distinguish analysis from preview preparation and show their actual states without invented percentages.
- **Desktop review workspace:** player on the left, occupying roughly two-thirds of the width; findings panel on the right; timeline below the player.
- **Header:** original filename, compact overall progress such as **4 of 7 reviewed**, and **Export report**. Include a compact findings summary without large statistics cards.
- **Smaller screens:** findings panel moves below the player and timeline. The same review actions remain available.

The workspace must continuously make clear which interval is selected, its current review decision, and what remains unreviewed.

## Look and Feel

Source: `scope.md > Inspiration & Identity`, refined by the learner's workspace description.

- Dark graphite theme with subtly differentiated surfaces and high-contrast text.
- One blue accent for selection and navigation.
- Amber for **Unreviewed**; red only for findings marked **Problematic**. Type is expressed through text labels, not separate type colors.
- A readable typeface and tabular numerals for timestamps.
- Visible keyboard focus, explicit labels, and a selected state distinguishable beyond color alone.
- Compact controls and findings entries that leave room for the video. No decorative gradients or unnecessary animation.
- The exported report uses readable, self-contained styling and a usable printed layout; it need not reproduce the workspace's dark background on paper.

## Language and Terminology

All code, code comments, identifiers, documentation, interface text, errors, and exported report text use clear, correct English. Use the same terminology and timestamp presentation in the workspace and report.

| Concept | Required term or label |
| --- | --- |
| A detected interval requiring human judgment | Finding |
| Finding types / timeline tracks | **Black frames**, **Frozen frames**, **Silence** |
| Initial or restored review decision | **Unreviewed** |
| Reviewer accepts the interval as deliberate | **Intentional** |
| Reviewer considers the interval an issue | **Problematic** |
| Review actions | **Mark as intentional**, **Mark as problematic**, **Restore to unreviewed** |
| Navigation | **Next unreviewed** |
| Entry actions | **Upload video**, **Try the demo** |
| Report action | **Export report** |
| Successful analysis with no findings | **No suspicious intervals detected** |
| Video has no audio track | **No audio track** |

Findings are candidates for review, not confirmed defects. **Intentional** and **Problematic** are reviewer decisions. The app and report must not claim that no findings means a defect-free video.

## Features and Behavior

### Video Intake and Limits

Implements `scope.md > The POC Boundary`.

- Accept one video at a time in MP4, MOV, MKV, or WebM, subject to a documented minimum matrix of container and codec combinations.
- Maximum duration: **five minutes**. Maximum size: **500 MB** per file. These are initial limits that must be validated through performance testing; passing validation does not imply a guaranteed processing time.
- Show the limits before loading a file. Unsupported containers/codecs, oversized or overlong files, unreadable/corrupt media, and files without usable video receive a clear explanation.
- Preserve the original for analysis. Do not modify or replace it with a preview.
- **Try the demo** loads the clearly identified synthetic sample into the real processing and review workflow.

Acceptance: a documented supported sample can enter the workflow; invalid or out-of-limit input receives the relevant error rather than a generic success or an empty result. Boundary checks must agree with the limits displayed to the user.

### Analysis and Compatible Preview

Implements `scope.md > The Core Loop`, `What "Working" Looks Like`, and `The POC Boundary`.

- Run FFmpeg detection for **Black frames**, **Frozen frames**, and **Silence** on the original using simple documented settings.
- Separate analysis support from browser playback support. Direct playback uses the original where supported; otherwise prepare a compatible preview locally for supported inputs.
- Keep the original's findings and the playable video's timeline aligned. Seeking to a finding must reach the corresponding content whether playing the original or preview.
- Represent preview preparation and analysis as distinct processing states. Show numerical progress only where measured reliably; otherwise show the phase and activity state.
- Detect and explicitly identify **No audio track**. Do not synthesize a full-duration **Silence** finding for missing audio.
- Analysis failure is an error, not a successful analysis with no findings. Preview failure is reported separately and must not be presented as successful playback readiness.
- **Preview failure:** keep completed analysis results available and allow report export if preview preparation fails. Disable playback-dependent controls and clearly disclose the failure in the interface and report. Findings remain **Unreviewed** unless explicitly classified by the user; failure or export never implies a review decision. Inspection of finding details and explicit classification remain possible without claiming that playback or visual review occurred.

Acceptance: a supported file needing a preview remains analyzable from its original; a known interval is found and reviewed at the corresponding time in the preview. A no-audio fixture displays the explicit audio state and no fabricated silence interval. Processing errors are distinguishable from successful empty results. Force preview failure after successful analysis: retain the findings, disable playback-dependent controls, permit report export, disclose the failure in both places, and verify that decisions stay **Unreviewed** unless explicitly changed by the user.

### Timeline and Playback

Implements `scope.md > The Core Loop` and `The POC Boundary`.

- Three compact labeled tracks: **Black frames**, **Frozen frames**, **Silence**.
- Intervals represent their actual start, end, and duration. Very short intervals have a sufficiently large clickable/focusable target without changing their represented duration or reported times.
- The playhead follows the current playback position. The selected finding is clearly distinguished from other intervals and corresponds to the selected panel entry.
- Selecting an interval or panel entry seeks to approximately one second before its start, never below zero, and pauses playback. Selecting **Next unreviewed** follows the same behavior.
- Playback remains usable independently of review decisions. The timeline is for review and navigation; it does not edit, trim, or repair video.
- When preview preparation fails and no playable video is available, disable play/pause, seeking, timeline navigation, and **Next unreviewed**. Finding details and explicit review decisions remain accessible without attempting playback.

Acceptance: selecting findings from either surface chooses the same interval, performs the expected paused seek, and updates the highlight. A finding near the beginning clamps the seek to zero. Short and closely spaced findings remain reachable, including by keyboard through the findings panel.

### Findings, Filters, and Review Decisions

Implements `scope.md > The Core Loop` and `The POC Boundary`.

- List findings chronologically. Each entry shows type, start timestamp, end timestamp, duration, and review decision.
- Provide compact filters for finding type and review status. Filters affect the review view and navigation; they do not delete findings or change their decisions.
- Every finding begins as **Unreviewed**. The selected finding offers **Mark as intentional** and **Mark as problematic**, with a way to restore **Unreviewed**.
- Decisions apply immediately and update compact overall review progress. **Intentional** and **Problematic** both count as reviewed. Progress covers all findings in the video, independent of filters.
- Making a decision does not automatically select another finding or seek elsewhere.
- If a decision makes the selected finding stop matching the active review-status filter, remove it from the filtered list, clear its selection, preserve playback position, and pause the video. The user chooses when to continue.
- **Next unreviewed** respects all active filters, searches forward chronologically, and wraps to the beginning. Disable it when there are no matching unreviewed findings, including when the active review-status filter excludes them.
- Distinguish an empty filtered view from an analysis that found no suspicious intervals.

Acceptance: review a finding under an **Unreviewed** filter and verify that selection clears, playback pauses without seeking, progress updates, and the next action remains manual. Verify forward navigation, wraparound, and the disabled state. Restore **Unreviewed** and verify that the decision and overall progress update correctly.

### Standalone HTML Report

Implements `scope.md > The Core Loop` and `What "Working" Looks Like`.

- **Export report** downloads one standalone HTML file with readable styling, no required network resources, and support for browser printing.
- Include original filename, the actual analysis settings used, findings with type/start/end/duration, and the current review decisions. Use the same terms and timestamp presentation as the workspace.
- Include overall review progress and clearly identify every remaining **Unreviewed** finding. Export is allowed before review is complete.
- Export the full analysis and decision set for the video; active view filters must not silently remove findings from the report.
- Preserve the distinction between detection and human judgment. Include the explicit **No audio track** state where applicable and the correct no-findings message after successful analysis with no findings.
- If analysis succeeded but preview preparation failed, disclose that playback was unavailable. Do not portray the report as a completed visual review. Preserve the actual decisions, including **Unreviewed** for every finding not explicitly classified by the user.

Acceptance: make a mix of **Intentional**, **Problematic**, and **Unreviewed** decisions, apply a filter, export, and compare all report entries and progress with the underlying review. Open the file offline and inspect its browser print preview. A no-findings export accurately reflects successful analysis without declaring the video defect-free.

### Accessibility and Responsive Review

Implements `scope.md > The POC Boundary`.

- All controls support keyboard navigation and visible focus. Findings, filters, playback, decisions, navigation, and export must be usable without a mouse.
- Type, decision, selection, and processing state have meaningful labels; color is supplementary.
- On smaller screens the panel appears below the player and timeline without losing review actions or critical timestamps.
- Validate timeline readability and findings-panel density with a video containing many findings. Users must still be able to identify and select individual findings and understand remaining work.

Acceptance: complete the demo workflow using the keyboard, inspect visible focus, and check the smaller-screen layout. On the many-findings fixture, confirm individual interval selection, readable timestamps, and consistency between the panel and selected timeline interval.

## States and Boundaries

| State | Required user-visible outcome |
| --- | --- |
| Initial | **Upload video**, **Try the demo**, supported formats and limits |
| Invalid or unsupported input | Clear reason for rejection; no successful-analysis claim |
| Processing | Distinct analysis/preview states; reliable progress only |
| Analysis failed | Clear analysis error; no misleading zero-findings success |
| Preview failed | Keep successful analysis results and export; disable playback-dependent controls; disclose failure in UI/report; decisions change only through explicit user classification |
| Ready with findings | Player, timeline, chronological findings, decisions, progress, and export |
| Ready without findings | **No suspicious intervals detected**; report remains available |
| No audio track | **No audio track**; no missing-audio silence finding |
| No filter matches | Clear filtered-empty state; underlying findings and decisions remain intact |
| Selection removed by a decision | Clear selection, preserve playback position, pause; no automatic advance |
| No matching unreviewed findings | **Next unreviewed** disabled |
| Review incomplete | Export allowed; report clearly identifies **Unreviewed** findings |
| Review complete | Progress reflects all findings reviewed; decisions remain changeable |
| Session ends | Review state is not restored across sessions; no persistence promise |

## Product Decisions

- Build a video review workspace around locating, watching, deciding, and continuing; protect video space instead of adding large statistics cards.
- Use English and consistent terminology throughout source, documentation, UI, and reports.
- Support MP4, MOV, MKV, and WebM through a bounded, tested codec matrix. Use duration and file-size limits to keep the proof of concept feasible.
- Start with five minutes and 500 MB; validate these limits through performance testing rather than assuming fast processing.
- Analyze the original and generate a compatible preview where necessary, with aligned timestamps. Preview work and its validation are part of the same-day implementation target.
- Keep decisions immediate and navigation explicit. Filter-sensitive navigation wraps, and a selected finding removed by a decision clears without moving playback.
- Allow incomplete review exports as standalone, offline, printable HTML with unreviewed findings clearly identified.
- Use the learner's dark graphite visual direction and responsive layout; validate density with many findings.

**Approved error policy:** retain and allow export of completed analysis if preview preparation fails. Disable playback-dependent controls and disclose the failure in both interface and report. Findings stay **Unreviewed** unless explicitly classified by the user.

## What We're Building

The complete local workflow above, including synthetic demo, normal/no-audio validation, a minimal tested format matrix and preview path, dense-findings review validation, accessible decisions, and accurate HTML export. The 1–3 minute demonstration must show all three finding types and the result of human review.

## Deferred From the POC

Cross-session persistence is deferred. Long videos, batch processing, and containers or codec combinations outside the documented matrix are unsupported for this proof of concept.

## Non-Goals

No video editing, repair, accounts, billing, cloud storage, collaboration, universal codec support, or large detection-settings panel. No external AI service is needed by the agreed workflow. Deployment is not required for this local proof of concept.

## Decisions and Validation for the Technical Specification

- Select and document the minimum container/video-codec/audio-codec matrix and supported browser environment. For every supported combination, specify original playback or preview fallback and validate both analysis and review. Do not claim compatibility from file extension alone.
- Choose simple detection thresholds and a numeric tolerance for comparing detected and expected intervals. Define the common timestamp representation and original-to-preview alignment.
- Define how size/duration limits are measured and applied, and test boundaries. Measure analysis plus preview cost at representative loads before claiming the initial limits are practical on the test machine.
- Specify how valid but demanding inputs, unsupported media, decoding errors, and preview failures terminate with understandable feedback instead of hanging indefinitely.
- Trace temporary original/preview files, cleanup, and session lifetime so local processing and lack of cross-session persistence are accurately documented.
- Define the implementation of filter-aware forward/wrapping navigation, including the navigation position retained when selection is cleared, without introducing automatic advancement.
- Verify keyboard behavior, responsive layout, short-interval targets, and density using real rendered samples. These are required build checks, not completed validation.

No stack, exact codec matrix, detection thresholds, numeric timestamp tolerance, or processing-time guarantee is approved by this PRD. Those belong in `4-spec`. The product definition, including the clarified preview-failure policy, is approved. Prioritize codec compatibility, preview timestamp alignment, and practical validation of the five-minute/500 MB limits during technical planning.
