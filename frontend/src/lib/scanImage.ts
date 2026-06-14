/** Width of the centered target box as a fraction of the visible preview. */
export const TARGET_WIDTH_RATIO = 0.75

/** Height of the centered target box as a fraction of the visible preview. */
export const TARGET_HEIGHT_RATIO = 0.35

/** Upscale factor applied before OCR preprocessing. */
export const PREPROCESS_SCALE = 2

/** Aspect ratio (width / height) the camera preview is displayed at, matching the `aspect-video` CSS class. */
export const DISPLAY_ASPECT_RATIO = 16 / 9

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export type PreprocessMode = 'grayscale' | 'threshold' | 'threshold-invert'

export const VARIANT_MODES = [
  { mode: 'grayscale' },
  { mode: 'threshold', threshold: 128 },
  { mode: 'threshold', threshold: 160 },
  { mode: 'threshold', threshold: 'auto' },
  { mode: 'threshold-invert', threshold: 'auto' },
] as const

/**
 * Returns the centered sub-rect of a camera frame that remains visible when the
 * frame is displayed with `object-fit: cover` at the given aspect ratio — the rest
 * is cropped off-screen by the browser and never seen by the user.
 */
export function getVisibleFrameRect(
  sourceWidth: number,
  sourceHeight: number,
  displayAspectRatio = DISPLAY_ASPECT_RATIO,
): CropRect {
  const sourceAspectRatio = sourceWidth / sourceHeight

  if (sourceAspectRatio > displayAspectRatio) {
    const width = Math.round(sourceHeight * displayAspectRatio)
    return { x: Math.round((sourceWidth - width) / 2), y: 0, width, height: sourceHeight }
  }

  const height = Math.round(sourceWidth / displayAspectRatio)
  return { x: 0, y: Math.round((sourceHeight - height) / 2), width: sourceWidth, height }
}

/**
 * Returns the centered crop rect for the on-screen target box, expressed in source
 * frame coordinates. Computed relative to the visible (post-`object-fit: cover`)
 * portion of the frame so it matches what the user actually sees and aims at.
 */
export function getTargetCropRect(sourceWidth: number, sourceHeight: number): CropRect {
  const visible = getVisibleFrameRect(sourceWidth, sourceHeight)
  const width = Math.round(visible.width * TARGET_WIDTH_RATIO)
  const height = Math.round(visible.height * TARGET_HEIGHT_RATIO)
  return {
    x: visible.x + Math.round((visible.width - width) / 2),
    y: visible.y + Math.round((visible.height - height) / 2),
    width,
    height,
  }
}

function toGrayscale(r: number, g: number, b: number): number {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b)
}

export function preprocessPixels(
  source: Uint8ClampedArray,
  mode: PreprocessMode,
  threshold = 128,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source.length)
  for (let i = 0; i < source.length; i += 4) {
    const gray = toGrayscale(source[i], source[i + 1], source[i + 2])
    let value = gray
    if (mode === 'threshold') value = gray >= threshold ? 255 : 0
    if (mode === 'threshold-invert') value = gray >= threshold ? 0 : 255
    output[i] = value
    output[i + 1] = value
    output[i + 2] = value
    output[i + 3] = 255
  }
  return output
}

export function computeOtsuThreshold(source: Uint8ClampedArray): number {
  const histogram = new Array<number>(256).fill(0)
  let total = 0

  for (let i = 0; i < source.length; i += 4) {
    const gray = toGrayscale(source[i], source[i + 1], source[i + 2])
    histogram[gray] += 1
    total += 1
  }

  let sum = 0
  for (let i = 0; i < histogram.length; i += 1) {
    sum += i * histogram[i]
  }

  let sumBackground = 0
  let weightBackground = 0
  let maxVariance = -1
  let bestThreshold = 128

  for (let threshold = 0; threshold < histogram.length; threshold += 1) {
    weightBackground += histogram[threshold]
    if (weightBackground === 0) continue

    const weightForeground = total - weightBackground
    if (weightForeground === 0) break

    sumBackground += threshold * histogram[threshold]

    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sum - sumBackground) / weightForeground
    const varianceBetween =
      weightBackground * weightForeground * (meanBackground - meanForeground) ** 2

    if (varianceBetween > maxVariance) {
      maxVariance = varianceBetween
      bestThreshold = threshold
    }
  }

  return bestThreshold
}

function createVariantCanvas(
  source: ImageData,
  width: number,
  height: number,
  mode: PreprocessMode,
  threshold?: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const output = ctx.createImageData(width, height)
  output.data.set(preprocessPixels(source.data, mode, threshold))
  ctx.putImageData(output, 0, 0)
  return canvas
}

/**
 * Upscales a cropped region and returns high-contrast grayscale/threshold variants
 * for OCR.
 */
export function preprocessTargetRegion(
  cropped: HTMLCanvasElement,
  scale = PREPROCESS_SCALE,
): HTMLCanvasElement[] {
  const scaled = document.createElement('canvas')
  scaled.width = cropped.width * scale
  scaled.height = cropped.height * scale
  const scaledCtx = scaled.getContext('2d')
  if (!scaledCtx) return [scaled]

  scaledCtx.imageSmoothingEnabled = false
  scaledCtx.drawImage(cropped, 0, 0, scaled.width, scaled.height)

  const imageData = scaledCtx.getImageData(0, 0, scaled.width, scaled.height)
  const adaptiveThreshold = computeOtsuThreshold(imageData.data)

  return VARIANT_MODES.map((variant) =>
    createVariantCanvas(
      imageData,
      scaled.width,
      scaled.height,
      variant.mode,
      'threshold' in variant
        ? variant.threshold === 'auto'
          ? adaptiveThreshold
          : variant.threshold
        : undefined,
    ),
  )
}

/**
 * Captures the centered target region from a live video frame and returns
 * preprocessed OCR variants.
 */
export function captureAndPreprocessTarget(
  video: HTMLVideoElement,
  workCanvas: HTMLCanvasElement,
): HTMLCanvasElement[] {
  workCanvas.width = video.videoWidth
  workCanvas.height = video.videoHeight

  const ctx = workCanvas.getContext('2d')
  if (!ctx) return []

  ctx.drawImage(video, 0, 0, workCanvas.width, workCanvas.height)
  const rect = getTargetCropRect(workCanvas.width, workCanvas.height)

  const cropped = document.createElement('canvas')
  cropped.width = rect.width
  cropped.height = rect.height
  const croppedCtx = cropped.getContext('2d')
  if (!croppedCtx) return []

  croppedCtx.drawImage(
    workCanvas,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height,
  )

  return preprocessTargetRegion(cropped)
}
