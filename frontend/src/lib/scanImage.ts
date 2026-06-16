/** Width of the centered target box as a fraction of the visible preview. */
export const TARGET_WIDTH_RATIO = 0.75

/** Height of the centered target box as a fraction of the visible preview. */
export const TARGET_HEIGHT_RATIO = 0.35

/** Vertical scan offsets, as fractions of the visible preview height. */
export const TARGET_VERTICAL_OFFSETS = [0, 0.22, 0.44] as const

/** Upscale factor applied before OCR preprocessing. */
export const PREPROCESS_SCALE = 2

/** Minimum Laplacian-variance sharpness score for OCR to run. */
export const MIN_SHARPNESS_SCORE = 50

/** Minimum grayscale standard deviation for OCR to run. */
export const MIN_CONTRAST_SCORE = 20

/** Maximum mean absolute pixel delta between consecutive frames. */
export const MAX_MOTION_SCORE = 15

export type FrameQualityReason = 'blur' | 'low-contrast' | 'motion'

export interface FrameQualityResult {
  sharpness: number
  contrast: number
  motion: number
  acceptable: boolean
  reason?: FrameQualityReason
}

/** Aspect ratio (width / height) the camera preview is displayed at, matching the `aspect-video` CSS class. */
export const DISPLAY_ASPECT_RATIO = 16 / 9

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export type PreprocessMode = 'grayscale' | 'threshold' | 'threshold-invert'

const FOCUSED_SUBCROP_MIN_WIDTH = 300
const FOCUSED_SUBCROP_MIN_HEIGHT = 100

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
  return getTargetCropRects(sourceWidth, sourceHeight)[0]
}

export function getTargetCropRects(sourceWidth: number, sourceHeight: number): CropRect[] {
  const visible = getVisibleFrameRect(sourceWidth, sourceHeight)
  const width = Math.round(visible.width * TARGET_WIDTH_RATIO)
  const height = Math.round(visible.height * TARGET_HEIGHT_RATIO)
  const x = visible.x + Math.round((visible.width - width) / 2)
  const centeredY = visible.y + Math.round((visible.height - height) / 2)
  const maxY = visible.y + visible.height - height

  return TARGET_VERTICAL_OFFSETS.map((offset) => ({
    x,
    y: Math.max(visible.y, Math.min(maxY, centeredY + Math.round(visible.height * offset))),
    width,
    height,
  }))
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

export type CanvasFactory = (width?: number, height?: number) => HTMLCanvasElement

let canvasFactory: CanvasFactory | null = null

/** Allows Node runners to supply a canvas implementation before calling scan helpers. */
export function setCanvasFactory(factory: CanvasFactory | null): void {
  canvasFactory = factory
}

function createProcessingCanvas(width = 1, height = 1): HTMLCanvasElement {
  if (canvasFactory) {
    const canvas = canvasFactory(width, height)
    canvas.width = width
    canvas.height = height
    return canvas
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function createVariantCanvas(
  source: ImageData,
  width: number,
  height: number,
  mode: PreprocessMode,
  threshold?: number,
): HTMLCanvasElement {
  const canvas = createProcessingCanvas(width, height)
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
  const scaled = createProcessingCanvas(cropped.width * scale, cropped.height * scale)
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

function getFocusedSubcrops(source: HTMLCanvasElement): HTMLCanvasElement[] {
  if (source.width < FOCUSED_SUBCROP_MIN_WIDTH || source.height < FOCUSED_SUBCROP_MIN_HEIGHT) {
    return []
  }

  const focusRects: CropRect[] = [
    {
      x: Math.round(source.width * 0.5),
      y: Math.round(source.height * 0.42),
      width: Math.round(source.width * 0.45),
      height: Math.round(source.height * 0.45),
    },
    {
      x: Math.round(source.width * 0.42),
      y: 0,
      width: Math.round(source.width * 0.53),
      height: source.height,
    },
  ]

  return focusRects.map((rect) =>
    extractCropFromCanvas(source, {
      x: Math.min(source.width - rect.width, Math.max(0, rect.x)),
      y: Math.min(source.height - rect.height, Math.max(0, rect.y)),
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    }),
  )
}

/** Extracts per-pixel grayscale values from RGBA image data. */
export function extractGrayscalePixels(data: Uint8ClampedArray): Uint8Array {
  const gray = new Uint8Array(data.length / 4)
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
    gray[j] = toGrayscale(data[i], data[i + 1], data[i + 2])
  }
  return gray
}

/** Reads grayscale pixel values from a canvas. */
export function getGrayscaleFromCanvas(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d')
  if (!ctx) return new Uint8Array(0)
  const { width, height } = canvas
  const imageData = ctx.getImageData(0, 0, width, height)
  return extractGrayscalePixels(imageData.data)
}

/**
 * Laplacian-variance sharpness score. Higher values indicate a sharper frame.
 */
export function computeSharpnessScore(grayscale: Uint8Array, width: number, height: number): number {
  if (width < 3 || height < 3 || grayscale.length !== width * height) return 0

  let sum = 0
  let count = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x
      const lap =
        -4 * grayscale[idx] +
        grayscale[idx - 1] +
        grayscale[idx + 1] +
        grayscale[idx - width] +
        grayscale[idx + width]
      sum += lap * lap
      count += 1
    }
  }

  return count > 0 ? sum / count : 0
}

/** Grayscale standard deviation — higher values indicate richer contrast. */
export function computeContrastScore(grayscale: Uint8Array): number {
  if (grayscale.length === 0) return 0

  let sum = 0
  for (let i = 0; i < grayscale.length; i += 1) sum += grayscale[i]
  const mean = sum / grayscale.length

  let variance = 0
  for (let i = 0; i < grayscale.length; i += 1) {
    const delta = grayscale[i] - mean
    variance += delta * delta
  }

  return Math.sqrt(variance / grayscale.length)
}

/** Mean absolute pixel delta between two grayscale buffers of equal length. */
export function computeMotionScore(previous: Uint8Array, current: Uint8Array): number {
  if (previous.length === 0 || previous.length !== current.length) return Infinity

  let sum = 0
  for (let i = 0; i < previous.length; i += 1) {
    sum += Math.abs(current[i] - previous[i])
  }

  return sum / previous.length
}

/** Cheap gate that rejects blurry, flat, or moving frames before OCR. */
export function assessFrameQuality(
  grayscale: Uint8Array,
  width: number,
  height: number,
  previousGrayscale?: Uint8Array,
): FrameQualityResult {
  const sharpness = computeSharpnessScore(grayscale, width, height)
  const contrast = computeContrastScore(grayscale)
  const motion =
    previousGrayscale && previousGrayscale.length === grayscale.length
      ? computeMotionScore(previousGrayscale, grayscale)
      : 0

  if (sharpness < MIN_SHARPNESS_SCORE) {
    return { sharpness, contrast, motion, acceptable: false, reason: 'blur' }
  }
  if (contrast < MIN_CONTRAST_SCORE) {
    return { sharpness, contrast, motion, acceptable: false, reason: 'low-contrast' }
  }
  if (motion > MAX_MOTION_SCORE) {
    return { sharpness, contrast, motion, acceptable: false, reason: 'motion' }
  }

  return { sharpness, contrast, motion, acceptable: true }
}

/** Extracts a sub-region from a canvas into a new canvas. */
export function extractCropFromCanvas(
  source: HTMLCanvasElement,
  rect: CropRect,
): HTMLCanvasElement {
  const cropped = createProcessingCanvas(rect.width, rect.height)
  const croppedCtx = cropped.getContext('2d')
  if (!croppedCtx) return cropped

  croppedCtx.drawImage(
    source,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height,
  )

  return cropped
}

/** Returns target crop rects and extracted crop canvases for a static image. */
export function getCropsFromStaticImage(source: HTMLCanvasElement): {
  rect: CropRect
  crop: HTMLCanvasElement
}[] {
  const rects = getTargetCropRects(source.width, source.height)
  return rects.map((rect) => ({
    rect,
    crop: extractCropFromCanvas(source, rect),
  }))
}

/** Returns preprocessed OCR variants for each target crop of a static image. */
export function getPreprocessedCropsFromStaticImage(source: HTMLCanvasElement): {
  rect: CropRect
  variants: HTMLCanvasElement[]
}[] {
  return getCropsFromStaticImage(source).map(({ rect, crop }) => ({
    rect,
    variants: [
      ...preprocessTargetRegion(crop),
      ...getFocusedSubcrops(crop).flatMap((focused) => preprocessTargetRegion(focused)),
    ],
  }))
}

/**
 * Draws a live video frame onto a work canvas and returns preprocessed OCR crops.
 */
export function capturePreprocessedCrops(
  video: HTMLVideoElement,
  workCanvas: HTMLCanvasElement,
): { rect: CropRect; variants: HTMLCanvasElement[] }[] {
  workCanvas.width = video.videoWidth
  workCanvas.height = video.videoHeight

  const ctx = workCanvas.getContext('2d')
  if (!ctx) return []

  ctx.drawImage(video, 0, 0, workCanvas.width, workCanvas.height)
  return getPreprocessedCropsFromStaticImage(workCanvas)
}

/**
 * Captures the centered target crop from a live video frame without preprocessing.
 */
export function captureTargetCrop(
  video: HTMLVideoElement,
  workCanvas: HTMLCanvasElement,
): HTMLCanvasElement | null {
  workCanvas.width = video.videoWidth
  workCanvas.height = video.videoHeight

  const ctx = workCanvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(video, 0, 0, workCanvas.width, workCanvas.height)
  const rect = getTargetCropRect(workCanvas.width, workCanvas.height)

  const cropped = createProcessingCanvas(rect.width, rect.height)
  const croppedCtx = cropped.getContext('2d')
  if (!croppedCtx) return null

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

  return cropped
}

/**
 * Captures the centered target region from a live video frame and returns
 * preprocessed OCR variants as a flat list.
 */
export function captureAndPreprocessTarget(
  video: HTMLVideoElement,
  workCanvas: HTMLCanvasElement,
): HTMLCanvasElement[] {
  return capturePreprocessedCrops(video, workCanvas).flatMap((crop) => crop.variants)
}
