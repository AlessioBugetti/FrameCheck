# Slice 3 — Offline HTML report

Verified on 22 October 2026 with installed Chrome and the isolated backend on port 8766.

- Nine frontend unit tests pass, including pending/ready/server-failure/browser-failure playback disclosure.
- Production build passes.
- Five Chrome export cases pass in 9.0 seconds. Mixed Intentional, Problematic and Unreviewed decisions export all four findings while a type filter shows only one. Every timestamp/duration is compared against the live backend result; actual detection settings are checked.
- A filename containing HTML-like text renders literally. The document has no script, image, link, video or network resources; it opens with the browser context offline. A restrictive document policy prevents active content.
- Export works before browser readiness, after a simulated server preview failure, and after a real preview encode followed by browser media-request failure. The real backend preview-failure preservation path is separately covered in `tests/test_api.py`.
- A normal sample without an audio track exports No audio track, zero findings and the qualified successful-empty message.
- Chrome's print engine generated `report-print.pdf`. Both rendered A4 landscape pages were visually inspected: all rows/settings/footer remain present, table headers repeat and no columns are clipped. The final print-style refinement was rerun through the mixed-decisions browser case (1 passed in 2.8 seconds). This validates print output; it does not claim a human inspected Chrome's native print-dialog UI.

`report.png` is the offline screen rendering. The deliberately hostile filename is test evidence, not executed markup. Final learner exploration remains pending.
