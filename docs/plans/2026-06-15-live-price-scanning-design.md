# Live Price Scanning Design

**Date:** 2026-06-15

**Problem**

The current scanner waits a fixed `1500ms` between OCR attempts. That makes the camera feel sluggish even when the target box already contains a clear, stable price. On mobile, the user experience is gated by the timer rather than by OCR throughput.

**Goal**

Make price scanning feel live by removing the fixed cooldown and launching OCR as soon as the frame quality is good enough, while keeping battery use and false positives within reason.

**Constraints**

- OCR still runs on-device in the mobile WebView.
- `tesseract.js` remains the OCR engine for this iteration.
- Only one OCR job may run at a time.
- Manual `Scan now` remains available as a fallback.
- Existing stable-price confirmation and edit/confirm flow stay intact.

**Recommended Approach**

Adopt a hybrid live scanner:

1. Sample the target crop frequently with a cheap quality pass.
2. Launch OCR immediately when the frame is sharp, stable, and contrast-rich enough.
3. Skip low-quality frames instead of waiting for a fixed timer.
4. After OCR completes, immediately consider the next eligible frame rather than sleeping for `1500ms`.

This keeps OCR as the bottleneck, but removes the artificial delay around it.

**Architecture**

The existing scan loop in `frontend/src/views/ScanView.vue` changes from a timer-driven scheduler to a readiness-driven scheduler. A lightweight frame-quality helper in `frontend/src/lib/scanImage.ts` evaluates the cropped target region before OCR runs. The OCR worker and candidate tracker remain shared and single-flight.

**Data Flow**

1. Camera starts.
2. A live scheduler runs on a short cadence (`requestAnimationFrame` throttled to about `100ms`, or a similar low-overhead loop).
3. The scheduler captures only the target crop.
4. A frame-quality function scores blur, contrast, and motion relative to the previous crop.
5. If the crop is not good enough, update guidance text and skip OCR.
6. If the crop is good enough and OCR is idle, run OCR immediately.
7. Parse and stabilize the OCR result using the existing candidate tracker.
8. Stop the live loop after a stable detection or when the camera closes.

**Frame-Quality Heuristics**

- **Blur / sharpness:** use a cheap edge or luminance-delta score so blurry frames are rejected early.
- **Contrast:** reject very flat crops that are unlikely to OCR well.
- **Motion / stability:** compare the current crop with the previous crop and delay OCR while the user is still moving.

These checks are intentionally approximate. They only need to decide whether OCR is worth trying.

**User Experience**

- Scanning begins immediately after activation.
- Guidance becomes quality-based instead of timer-based:
  - `Hold steady`
  - `Move closer`
  - `Need more contrast`
  - `Looking for a price...`
- If a good frame is visible, the user should see detection in roughly OCR-time only.
- `Scan now` remains visible as a manual retry path.

**Failure Handling**

- Keep one OCR job in flight at all times; never queue stale frames.
- If OCR initialization fails, keep the existing retry/error path.
- If frame quality never becomes acceptable, stay in live preview mode and keep surfacing guidance.
- When the page is hidden, pause the scheduler and OCR attempts.

**Testing**

- Unit tests for blur/contrast/motion gating helpers.
- View tests proving the fixed `1500ms` loop is removed.
- View tests proving OCR is attempted immediately on a good frame and skipped on bad frames.
- Regression tests for hidden-page pause, retry, stable double-read behavior, and manual fallback.

**Out of Scope**

- Replacing `tesseract.js`
- Continuous full-frame OCR
- Server-side OCR
- Multi-language OCR tuning beyond the current price-focused character set
