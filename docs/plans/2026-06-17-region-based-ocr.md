# Region-Based OCR Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace crop-wide OCR ranking with a center-first, region-based OCR pipeline that can reconstruct spatially split prices and reject structurally implausible values.

**Architecture:** Keep the existing target-box UI and Tesseract worker, but insert a new candidate-region extraction layer between preprocessing and OCR. Rank OCR results by target-box center proximity first, then by layout quality and confidence, and verify behavior with the local fixture runner.

**Tech Stack:** TypeScript, Vue, Vitest, canvas-based image preprocessing, Tesseract.js, Node fixture runner

---

### Task 1: Add failing tests for region extraction and center-first ranking

**Files:**
- Create: `frontend/src/lib/priceRegions.test.ts`
- Modify: `frontend/src/lib/ocrPipeline.test.ts`

**Step 1: Write the failing tests**

Cover:
- connected components becoming candidate regions
- center-most candidate beating a larger off-center candidate
- isolated integer candidate being down-ranked when a split-cents layout exists nearby

**Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/lib/priceRegions.test.ts src/lib/ocrPipeline.test.ts`
Expected: FAIL because `priceRegions.ts` does not exist and center-first region ranking is not implemented

**Step 3: Commit the failing tests**

```bash
git add frontend/src/lib/priceRegions.test.ts frontend/src/lib/ocrPipeline.test.ts
git commit -m "test: define region-based OCR behavior"
```

### Task 2: Implement minimal region extraction

**Files:**
- Create: `frontend/src/lib/priceRegions.ts`
- Modify: `frontend/src/lib/scanImage.ts`
- Modify: `frontend/src/lib/scanImage.test.ts`
- Test: `frontend/src/lib/priceRegions.test.ts`

**Step 1: Write the minimal implementation**

Add helpers to:
- build binary masks from preprocessed crops
- extract connected components
- discard tiny noise regions
- compute bounding boxes, centers, and area
- return candidate subregions inside each crop

**Step 2: Run the targeted tests to verify they pass**

Run: `npm test -- src/lib/priceRegions.test.ts src/lib/scanImage.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/lib/priceRegions.ts frontend/src/lib/scanImage.ts frontend/src/lib/scanImage.test.ts frontend/src/lib/priceRegions.test.ts
git commit -m "feat: extract OCR candidate regions"
```

### Task 3: Add failing tests for split-price reconstruction

**Files:**
- Modify: `frontend/src/lib/ocrPipeline.test.ts`
- Modify: `frontend/src/lib/priceDetection.test.ts`

**Step 1: Write the failing tests**

Cover:
- `$299` + `95` reconstructs to `299.95 USD`
- `€3` + `99` reconstructs to `3.99 EUR`
- a lone `$900` candidate loses to a reconstructed `$299.95`

**Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/lib/ocrPipeline.test.ts src/lib/priceDetection.test.ts`
Expected: FAIL because spatial reconstruction is not implemented yet

**Step 3: Commit the failing tests**

```bash
git add frontend/src/lib/ocrPipeline.test.ts frontend/src/lib/priceDetection.test.ts
git commit -m "test: define split-price reconstruction behavior"
```

### Task 4: Implement region-level OCR and spatial reconstruction

**Files:**
- Modify: `frontend/src/lib/ocrPipeline.ts`
- Modify: `frontend/src/lib/priceDetection.ts`
- Test: `frontend/src/lib/ocrPipeline.test.ts`
- Test: `frontend/src/lib/priceDetection.test.ts`

**Step 1: Write the minimal implementation**

Update the pipeline to:
- OCR candidate regions instead of full crops first
- assemble neighboring integer/cents/symbol fragments
- score reconstructed prices by center distance, completeness, and OCR confidence
- penalize suspicious isolated integers

**Step 2: Run the targeted tests to verify they pass**

Run: `npm test -- src/lib/ocrPipeline.test.ts src/lib/priceDetection.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/lib/ocrPipeline.ts frontend/src/lib/priceDetection.ts frontend/src/lib/ocrPipeline.test.ts frontend/src/lib/priceDetection.test.ts
git commit -m "feat: reconstruct split price regions"
```

### Task 5: Wire the live scanner to the region-based pipeline

**Files:**
- Modify: `frontend/src/views/ScanView.vue`
- Modify: `frontend/src/views/ScanView.test.ts`

**Step 1: Write or update the failing view tests**

Cover:
- accepted auto-detect result comes from the highest-ranked center candidate
- suspicious isolated OCR results do not auto-confirm

**Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- src/views/ScanView.test.ts`
Expected: FAIL until the view consumes the updated pipeline behavior

**Step 3: Write the minimal integration changes**

Keep the UI flow the same, but update the consumed pipeline result structure if needed.

**Step 4: Run the targeted tests to verify they pass**

Run: `npm test -- src/views/ScanView.test.ts src/lib/ocrPipeline.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/views/ScanView.vue frontend/src/views/ScanView.test.ts
git commit -m "refactor: use region-based OCR selection in scan view"
```

### Task 6: Add fixture-runner verification for labeled price fixtures

**Files:**
- Modify: `frontend/scripts/ocr-fixture-runner.ts`
- Modify: `frontend/scripts/ocr-fixture-runner.test.ts`
- Modify: `frontend/scripts/ocr-fixture-runner.lib.ts`
- Create: `frontend/fixtures/ocr/README.md` (optional if useful)

**Step 1: Write the failing tests**

Cover:
- readable summary includes the chosen winner
- JSON output remains stable with region-based results
- optional expected-output comparison hook if implemented in this pass

**Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- scripts/ocr-fixture-runner.test.ts`
Expected: FAIL if output shape changes are not handled yet

**Step 3: Write the minimal implementation**

Keep the runner aligned with the shared pipeline and ensure artifacts remain useful for debugging region extraction.

**Step 4: Run the targeted tests to verify they pass**

Run: `npm test -- scripts/ocr-fixture-runner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/scripts/ocr-fixture-runner.ts frontend/scripts/ocr-fixture-runner.lib.ts frontend/scripts/ocr-fixture-runner.test.ts frontend/fixtures/ocr
git commit -m "refactor: align OCR fixture runner with region pipeline"
```

### Task 7: Verify against the real fixture set

**Files:**
- Modify: none expected

**Step 1: Run the full frontend suite**

Run: `npm test`
Expected: PASS

**Step 2: Run the production build**

Run: `npm run build`
Expected: PASS

**Step 3: Run the fixture runner against the known images**

Run:

```bash
npm run ocr:fixture -- \
  /tmp/nimlens-debug-tagsprinter/tagsprinter.png \
  /tmp/nimlens-ocr-user-links/printable-template \
  /tmp/nimlens-ocr-user-links/dailymeal \
  --currency EUR
```

Expected:
- `tagsprinter` no longer returns `900`
- `printable-template` detects `10.00 USD`
- `dailymeal` still detects `11.09` correctly

**Step 4: Run whitespace validation**

Run: `git diff --check`
Expected: no output

**Step 5: Commit final cleanup if needed**

```bash
git add -A
git commit -m "chore: finalize region-based OCR pipeline"
```
