# Auto Price Scanning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically recognize a stable price from a focused camera target while preserving a manual scan fallback.

**Architecture:** Extract camera cropping, preprocessing, and candidate stabilization into testable utilities. Reuse a configured Tesseract worker, and let `ScanView` coordinate a single recurring OCR loop that pauses after a stable result or when the page is hidden.

**Tech Stack:** Vue 3, TypeScript, Canvas 2D, Tesseract.js 7, Vitest

---

### Task 1: Target Crop And Preprocessing

**Files:**
- Create: `frontend/src/lib/scanImage.ts`
- Create: `frontend/src/lib/scanImage.test.ts`

**Steps:**
1. Write failing tests for centered target crop coordinates and 2x processed output dimensions.
2. Run `npm test -- --run src/lib/scanImage.test.ts` and verify failure.
3. Implement crop coordinate calculation and grayscale/threshold preprocessing.
4. Run the focused test and verify it passes.
5. Commit the utility and tests.

### Task 2: Stable Price Candidates

**Files:**
- Create: `frontend/src/lib/priceCandidate.ts`
- Create: `frontend/src/lib/priceCandidate.test.ts`

**Steps:**
1. Write failing tests requiring two consecutive matching prices and resetting on a mismatch.
2. Run `npm test -- --run src/lib/priceCandidate.test.ts` and verify failure.
3. Implement the minimal candidate tracker.
4. Run the focused test and verify it passes.
5. Commit the tracker and tests.

### Task 3: Reusable OCR Worker

**Files:**
- Modify: `frontend/src/lib/ocr.ts`
- Modify: `frontend/src/lib/ocr.test.ts`

**Steps:**
1. Write failing tests for worker reuse, price-character configuration, and termination.
2. Run `npm test -- --run src/lib/ocr.test.ts` and verify failure.
3. Replace one-shot `Tesseract.recognize` with a lazily created worker.
4. Run the focused test and verify it passes.
5. Commit the OCR worker changes.

### Task 4: Automatic Scan Loop And UI

**Files:**
- Modify: `frontend/src/views/ScanView.vue`
- Modify: `frontend/src/views/ScanView.test.ts`

**Steps:**
1. Write failing component tests for target overlay, automatic recurring scan, stable-result acceptance, retry resume, manual scan, and hidden-page pause.
2. Run `npm test -- --run src/views/ScanView.test.ts` and verify failure.
3. Add the target overlay, guidance state, one-at-a-time automatic loop, and **Scan now** fallback.
4. Run the focused component tests and verify they pass.
5. Commit the Scan view changes.

### Task 5: Verification

**Files:**
- No additional files required.

**Steps:**
1. Run `npm test` in `frontend/`.
2. Run `npm run build` in `frontend/`.
3. Run `git diff --check`.
4. Push the completed implementation and verify the GitHub container workflow.
5. Verify the camera workflow on an actual mobile device after the frontend image is redeployed.
