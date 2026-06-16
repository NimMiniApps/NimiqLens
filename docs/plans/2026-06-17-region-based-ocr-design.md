# Region-Based OCR Design

**Date:** 2026-06-17

**Problem**

The current OCR flow still treats the target crop as one flat text field. That works on some ESL labels, but it breaks badly on common price-tag layouts where the integer part, cents, and currency symbol are separated spatially. The `tagsprinter` example is the clearest failure: the visible price is `$299.95`, but the current pipeline can accept nonsense like `$900` because it OCRs the crop as raw text and then applies regex-based parsing.

**Goal**

Make price detection more reliable in general by extracting and ranking candidate price regions inside the target box before OCR, then reconstructing the price from spatial layout instead of trusting the first plausible text fragment.

**Success Criteria**

- The scanner prefers the price closest to the center of the target box.
- Split-cents layouts like `299` + `95` can be reconstructed into `299.95`.
- Lone syntactically valid but structurally suspicious values like `900` are rejected or down-ranked.
- The same region-based logic runs in both the live scanner and the fixture runner.
- Fixture-based verification becomes the primary iteration loop for OCR work.

**Selection Rule**

The target box defines user intent. When multiple plausible prices exist:

1. Prefer the candidate whose visual center is closest to the target-box center.
2. Break ties by stronger price layout quality.
3. Break remaining ties by OCR confidence.

This avoids jumping to a larger nearby label when the user is pointing at a different one.

**Recommended Approach**

Use a region-based heuristic pipeline inside the existing target box:

1. Generate a small set of high-contrast binary variants for the target crop.
2. Detect connected components and merge them into candidate numeric regions.
3. Build candidate price groups from nearby components:
   - main integer block
   - smaller cents block
   - nearby currency symbol or code
4. OCR each candidate region rather than the entire crop.
5. Reconstruct and score prices using both text and geometry.
6. Return the highest-ranked candidate that passes structural sanity checks.

This keeps the current Tesseract-based stack, but changes what we feed into OCR and how we interpret the result.

**Why This Approach**

It is the smallest architectural change that addresses the real failure mode. The problem is not just OCR quality. The pipeline is currently mixing product name, barcode, date, unit text, and price into one OCR pass. Region extraction removes most of that noise before OCR runs.

**Rejected Alternatives**

**1. More regex and scoring tweaks**

This is not enough. It can reduce some false positives, but it cannot reliably reconstruct layouts where the price is spatially split.

**2. Train or integrate a dedicated ML detector now**

That may be the long-term ceiling, but it adds much more tooling, data, and deployment complexity than this repo needs for the next iteration.

**Core Design**

**1. Region extraction**

Add a new image-processing layer that works inside the existing target crop. It should:

- threshold the crop into binary masks
- find connected components
- discard tiny noise blobs
- compute bounding boxes and area statistics
- merge nearby components into candidate clusters

The output should be structured candidate regions, not just canvases.

**2. Candidate grouping**

A price cluster often includes differently sized text:

- large integer digits
- smaller cents digits, often top-right aligned
- currency symbol to the left

The grouping logic should allow asymmetric layouts and should not require the full price to appear as one OCR token.

**3. Region-level OCR**

Each candidate region gets OCRed independently, using the existing Tesseract worker and preprocessing variants. This should drastically reduce interference from barcodes, descriptions, dates, and unit-price rows.

**4. Spatial reconstruction**

After OCR, the pipeline should merge fragments into one price candidate using:

- relative position
- relative size
- horizontal overlap / adjacency
- currency symbol proximity

Examples:

- `$` + `299` + `95` -> `$299.95`
- `€` + `3` + `99` -> `€3.99`
- reject `900` if the geometry strongly suggests a clipped `299` + `95` layout nearby

**5. Candidate scoring**

Candidate ranking should combine:

- distance from candidate center to target-box center
- OCR digit confidence
- layout quality score
- completeness of reconstructed price
- penalties for suspicious isolated integers or noisy mixed fragments

Center distance is the primary tie-breaker because it best matches user intent.

**6. Rejection behavior**

If the pipeline finds only weak or structurally suspicious candidates, it should return no price instead of returning obvious nonsense. False negatives are still bad, but false confident prices are worse.

**Module Changes**

- `frontend/src/lib/scanImage.ts`
  - keep target-crop generation
  - expose binary/preprocessed variants suitable for component analysis

- `frontend/src/lib/priceRegions.ts` (new)
  - connected-component extraction
  - candidate region grouping
  - region metadata and geometry scoring

- `frontend/src/lib/ocrPipeline.ts`
  - switch from crop-wide OCR ranking to candidate-region OCR ranking
  - reconstruct price fragments before final selection

- `frontend/src/lib/priceDetection.ts`
  - remain the final parser entry point
  - add explicit support for reconstructed fragment strings where needed

- `frontend/scripts/ocr-fixture-runner.ts`
  - add expected-output comparison mode later
  - keep using the shared pipeline directly

**Testing Strategy**

The work should be driven by fixtures and unit tests together.

**Unit tests**

- connected-component grouping
- center-first ranking
- split-cents reconstruction
- rejection of isolated nonsense like `900`

**Fixture tests / manual runner verification**

Start with a small labeled set:

- `tagsprinter`: expected `299.95 USD`
- `printable-template`: expected `10.00 USD`
- `dailymeal`: expected `11.09 USD`
- existing shelf and Zara-style hard cases

**Out of Scope**

- ML-based object detection
- full automatic fixture downloading
- remote OCR services
- changing the UI target-box interaction

**Risk**

The main risk is overfitting to a few tag layouts. The mitigation is center-first ranking plus fixture diversity. The design should stay general at the geometry level rather than encoding one vendor template.

**Recommendation**

Implement the region layer now, keep it behind the existing OCR pipeline surface, and use the fixture runner as the main benchmark loop. That is the most direct path to general reliability without replacing the stack.
