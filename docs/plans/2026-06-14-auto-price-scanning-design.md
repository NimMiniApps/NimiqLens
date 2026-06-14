# Auto Price Scanning Design

## Goal

Improve mobile price recognition by automatically scanning a focused target
area while retaining a manual scan fallback.

## User Experience

- The camera preview displays a centered price-target box.
- While the camera is active, NimLens automatically scans the target area about
  every 1.5 seconds.
- Guidance communicates the current state: looking for a price, hold steady, or
  move closer.
- A detected price must appear in two consecutive scans before NimLens accepts
  it.
- After acceptance, automatic scanning pauses and the existing editable
  confirmation panel appears.
- A **Scan now** button remains available as a manual fallback.
- Retrying resumes automatic scanning.

## OCR Pipeline

Only the target-box portion of the video frame is captured. The crop is scaled
up and converted into multiple high-contrast grayscale/threshold variants.
Tesseract runs against those variants using one reusable worker configured for
price-related characters.

Each recognized text result is passed through the existing price detector. The
first valid candidate is tracked between scans. A candidate is accepted only
when the amount and currency match a consecutive result.

## Lifecycle And Errors

Automatic scanning starts after the camera and OCR worker are ready. Only one
OCR operation may run at a time. Scanning pauses when a price is accepted, the
page becomes hidden, or the component unmounts. Camera tracks and the OCR worker
are released on unmount.

OCR failures do not stop the camera. The UI keeps the manual scan fallback and
shows a concise error or guidance state.

## Testing

- Unit-test crop coordinates and preprocessing output dimensions.
- Unit-test candidate stabilization and reset behavior.
- Component-test automatic scanning lifecycle, manual fallback, retry, and
  confirmation behavior.
- Verify the full frontend test suite and production build.
- Verify on an actual mobile device after deployment.
