# Live Price Scanning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the fixed 1.5 second scan delay and make the camera feel live by triggering OCR as soon as the target crop is good enough.

**Architecture:** Replace the timer-based scan loop in `ScanView.vue` with a readiness-driven loop that samples the target crop frequently, runs a cheap frame-quality gate, and launches OCR only when the crop is sharp, stable, and contrast-rich enough. Keep the single shared OCR worker, the existing price candidate tracker, and the manual fallback flow.

**Tech Stack:** Vue 3, TypeScript, Vitest, Tesseract.js, HTML canvas image processing

---

### Task 1: Add failing tests for live scheduling and frame-quality gating

**Files:**
- Modify: `frontend/src/views/ScanView.test.ts`
- Modify: `frontend/src/lib/scanImage.test.ts`

**Step 1: Write the failing scan loop tests**

Add tests that prove:
- OCR can start without waiting `1500ms`
- bad-quality frames do not trigger OCR
- a good frame triggers OCR as soon as the scheduler sees it

**Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/views/ScanView.test.ts src/lib/scanImage.test.ts`
Expected: FAIL because the current implementation still depends on the fixed timer and has no frame-quality gate

**Step 3: Commit the failing tests**

```bash
git add frontend/src/views/ScanView.test.ts frontend/src/lib/scanImage.test.ts
git commit -m "test: cover live OCR scheduling"
```

### Task 2: Add frame-quality helpers for blur, contrast, and motion

**Files:**
- Modify: `frontend/src/lib/scanImage.ts`
- Modify: `frontend/src/lib/scanImage.test.ts`

**Step 1: Write the failing helper tests**

Add focused unit tests for:
- blur/sharpness score
- low-contrast rejection
- motion delta between two crops
- an overall `assessFrameQuality()` result

**Step 2: Run the targeted test file to verify it fails**

Run: `npm test -- src/lib/scanImage.test.ts`
Expected: FAIL because the new helper exports do not exist yet

**Step 3: Write the minimal implementation**

Add small pure functions that operate on image pixel buffers or cropped canvases:
- `computeSharpnessScore(...)`
- `computeContrastScore(...)`
- `computeMotionScore(...)`
- `assessFrameQuality(...)`

Keep them local to `scanImage.ts` unless a second caller appears.

**Step 4: Run the helper tests to verify they pass**

Run: `npm test -- src/lib/scanImage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/lib/scanImage.ts frontend/src/lib/scanImage.test.ts
git commit -m "feat: add live scan frame quality checks"
```

### Task 3: Replace the fixed timer loop with a readiness-driven scheduler

**Files:**
- Modify: `frontend/src/views/ScanView.vue`
- Modify: `frontend/src/views/ScanView.test.ts`

**Step 1: Write the failing scheduler tests**

Add tests for:
- no mandatory `1500ms` wait before the first OCR attempt
- no parallel OCR jobs while one is in flight
- live loop pauses when the page is hidden
- live loop restarts on retry

**Step 2: Run the targeted view tests to verify they fail**

Run: `npm test -- src/views/ScanView.test.ts`
Expected: FAIL because the current scheduler still uses `setTimeout(..., 1500)`

**Step 3: Write the minimal implementation**

In `ScanView.vue`:
- remove `SCAN_INTERVAL_MS`
- replace `scheduleNextScan()` with a short-cadence live scheduler
- sample frame quality before OCR
- start OCR immediately on good frames
- skip low-quality frames
- preserve single-flight OCR behavior

**Step 4: Run the targeted view tests to verify they pass**

Run: `npm test -- src/views/ScanView.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/views/ScanView.vue frontend/src/views/ScanView.test.ts
git commit -m "feat: run OCR as soon as frames are ready"
```

### Task 4: Update guidance text and detection flow for live mode

**Files:**
- Modify: `frontend/src/views/ScanView.vue`
- Modify: `frontend/src/views/ScanView.test.ts`

**Step 1: Write the failing UX tests**

Add tests that verify:
- blur/contrast/motion states map to user guidance
- detection still pauses the live loop after a stable result
- manual `Scan now` still bypasses waiting

**Step 2: Run the targeted view tests to verify they fail**

Run: `npm test -- src/views/ScanView.test.ts`
Expected: FAIL because the current guidance states are too limited

**Step 3: Write the minimal implementation**

Extend the scan guidance state machine and keep copy concise. Preserve the existing detected/edit/confirm panel behavior.

**Step 4: Run the targeted view tests to verify they pass**

Run: `npm test -- src/views/ScanView.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/views/ScanView.vue frontend/src/views/ScanView.test.ts
git commit -m "feat: add live scan guidance states"
```

### Task 5: Run full verification

**Files:**
- Modify: none expected

**Step 1: Run the full frontend test suite**

Run: `npm test`
Expected: PASS with all frontend tests green

**Step 2: Run the frontend production build**

Run: `npm run build`
Expected: PASS

**Step 3: Run whitespace validation**

Run: `git diff --check`
Expected: no output

**Step 4: Commit any final cleanups if needed**

```bash
git add -A
git commit -m "chore: finalize live price scanning"
```
