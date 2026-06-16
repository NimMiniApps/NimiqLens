import { describe, it, expect, beforeEach } from 'vitest'
import {
  TARGET_HEIGHT_RATIO,
  TARGET_WIDTH_RATIO,
  PREPROCESS_SCALE,
  DISPLAY_ASPECT_RATIO,
  TARGET_VERTICAL_OFFSETS,
  VARIANT_MODES,
  MIN_SHARPNESS_SCORE,
  MIN_CONTRAST_SCORE,
  MAX_MOTION_SCORE,
  computeOtsuThreshold,
  computeSharpnessScore,
  computeContrastScore,
  computeMotionScore,
  assessFrameQuality,
  getTargetCropRect,
  getTargetCropRects,
  getVisibleFrameRect,
  preprocessPixels,
  preprocessTargetRegion,
} from './scanImage'

describe('getVisibleFrameRect', () => {
  it('returns the full frame when its aspect ratio matches the display', () => {
    const rect = getVisibleFrameRect(1920, 1080)

    expect(rect).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('crops the top and bottom of a frame that is taller than the display', () => {
    // 800x600 (4:3) is narrower/taller than the 16:9 display box, so the
    // browser's object-fit: cover crops the top and bottom.
    const rect = getVisibleFrameRect(800, 600)

    expect(rect.width).toBe(800)
    expect(rect.height).toBe(Math.round(800 / DISPLAY_ASPECT_RATIO))
    expect(rect.x).toBe(0)
    expect(rect.y).toBe(Math.round((600 - rect.height) / 2))
  })

  it('crops the sides of a frame that is wider than the display', () => {
    // 2000x900 (~2.22:1) is wider than the 16:9 display box, so object-fit:
    // cover crops the left and right edges.
    const rect = getVisibleFrameRect(2000, 900)

    expect(rect.height).toBe(900)
    expect(rect.width).toBe(Math.round(900 * DISPLAY_ASPECT_RATIO))
    expect(rect.y).toBe(0)
    expect(rect.x).toBe(Math.round((2000 - rect.width) / 2))
  })
})

describe('getTargetCropRect', () => {
  it('returns a centered crop sized relative to the visible (post-crop) frame', () => {
    const visible = getVisibleFrameRect(800, 600)
    const rect = getTargetCropRect(800, 600)

    expect(rect.width).toBe(Math.round(visible.width * TARGET_WIDTH_RATIO))
    expect(rect.height).toBe(Math.round(visible.height * TARGET_HEIGHT_RATIO))
    expect(rect.x).toBe(visible.x + Math.round((visible.width - rect.width) / 2))
    expect(rect.y).toBe(visible.y + Math.round((visible.height - rect.height) / 2))
  })

  it('returns the same crop as before when the frame already matches the display aspect ratio', () => {
    const rect = getTargetCropRect(1920, 1080)

    expect(rect.width).toBe(Math.round(1920 * TARGET_WIDTH_RATIO))
    expect(rect.height).toBe(Math.round(1080 * TARGET_HEIGHT_RATIO))
    expect(rect.x).toBe(Math.round((1920 - rect.width) / 2))
    expect(rect.y).toBe(Math.round((1080 - rect.height) / 2))
  })

  it('adds additional in-bounds lower crop windows for price tags whose price sits below center', () => {
    const visible = getVisibleFrameRect(736, 734)
    const rects = getTargetCropRects(736, 734)

    expect(rects).toHaveLength(TARGET_VERTICAL_OFFSETS.length)
    expect(rects[0]).toEqual(getTargetCropRect(736, 734))
    expect(rects[1].y).toBeGreaterThan(rects[0].y)

    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(visible.x)
      expect(rect.y).toBeGreaterThanOrEqual(visible.y)
      expect(rect.x + rect.width).toBeLessThanOrEqual(visible.x + visible.width)
      expect(rect.y + rect.height).toBeLessThanOrEqual(visible.y + visible.height)
    }
  })
})

describe('preprocessTargetRegion', () => {
  let source: HTMLCanvasElement

  beforeEach(() => {
    source = document.createElement('canvas')
    source.width = 200
    source.height = 80
    const ctx = source.getContext('2d')
    ctx?.fillRect(0, 0, source.width, source.height)
  })

  it('returns a 2x scaled canvas even when the test canvas backend is unavailable', () => {
    const variants = preprocessTargetRegion(source)

    expect(variants.length).toBeGreaterThan(0)
    for (const variant of variants) {
      expect(variant.width).toBe(source.width * PREPROCESS_SCALE)
      expect(variant.height).toBe(source.height * PREPROCESS_SCALE)
    }
  })

  it('defines grayscale, fixed-threshold, and adaptive inverted OCR variants', () => {
    expect(VARIANT_MODES).toEqual([
      { mode: 'grayscale' },
      { mode: 'threshold', threshold: 128 },
      { mode: 'threshold', threshold: 160 },
      { mode: 'threshold', threshold: 'auto' },
      { mode: 'threshold-invert', threshold: 'auto' },
    ])
  })
})

describe('preprocessPixels', () => {
  it('converts color pixels to grayscale', () => {
    const pixels = new Uint8ClampedArray([255, 0, 0, 255])

    expect([...preprocessPixels(pixels, 'grayscale')]).toEqual([76, 76, 76, 255])
  })

  it('converts grayscale pixels to a threshold variant', () => {
    const pixels = new Uint8ClampedArray([
      100, 100, 100, 255,
      200, 200, 200, 255,
    ])

    expect([...preprocessPixels(pixels, 'threshold', 128)]).toEqual([
      0, 0, 0, 255,
      255, 255, 255, 255,
    ])
  })

  it('can invert a threshold variant for light-on-dark labels', () => {
    const pixels = new Uint8ClampedArray([
      100, 100, 100, 255,
      200, 200, 200, 255,
    ])

    expect([...preprocessPixels(pixels, 'threshold-invert', 128)]).toEqual([
      255, 255, 255, 255,
      0, 0, 0, 255,
    ])
  })
})

describe('computeOtsuThreshold', () => {
  it('selects a threshold between dark and bright clusters', () => {
    const pixels = new Uint8ClampedArray([
      20, 20, 20, 255,
      25, 25, 25, 255,
      220, 220, 220, 255,
      230, 230, 230, 255,
    ])

    const threshold = computeOtsuThreshold(pixels)

    expect(threshold).toBeGreaterThanOrEqual(25)
    expect(threshold).toBeLessThan(220)
  })
})

function makeCheckerboardGrayscale(width: number, height: number, cell = 4): Uint8Array {
  const gray = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const on = ((Math.floor(x / cell) + Math.floor(y / cell)) % 2) === 0
      gray[y * width + x] = on ? 255 : 0
    }
  }
  return gray
}

function makeUniformGrayscale(width: number, height: number, value: number): Uint8Array {
  const gray = new Uint8Array(width * height)
  for (let i = 0; i < gray.length; i += 1) gray[i] = value
  return gray
}

describe('frame quality helpers', () => {
  const width = 32
  const height = 24

  it('scores a sharp checkerboard higher than a uniform frame', () => {
    const sharp = makeCheckerboardGrayscale(width, height)
    const flat = makeUniformGrayscale(width, height, 128)

    expect(computeSharpnessScore(sharp, width, height)).toBeGreaterThan(
      computeSharpnessScore(flat, width, height),
    )
    expect(computeSharpnessScore(sharp, width, height)).toBeGreaterThanOrEqual(MIN_SHARPNESS_SCORE)
  })

  it('rejects low-contrast frames', () => {
    const flat = makeUniformGrayscale(width, height, 120)

    expect(computeContrastScore(flat)).toBeLessThan(MIN_CONTRAST_SCORE)
    expect(assessFrameQuality(flat, width, height).acceptable).toBe(false)
    expect(assessFrameQuality(flat, width, height).reason).toBe('blur')
  })

  it('measures motion between consecutive crops', () => {
    const still = makeCheckerboardGrayscale(width, height)
    const shifted = makeCheckerboardGrayscale(width, height, 2)

    expect(computeMotionScore(still, still)).toBe(0)
    expect(computeMotionScore(still, shifted)).toBeGreaterThan(MAX_MOTION_SCORE)
  })

  it('accepts a sharp, contrast-rich, stable frame', () => {
    const frame = makeCheckerboardGrayscale(width, height)

    const result = assessFrameQuality(frame, width, height, frame)

    expect(result.acceptable).toBe(true)
    expect(result.reason).toBeUndefined()
    expect(result.sharpness).toBeGreaterThanOrEqual(MIN_SHARPNESS_SCORE)
    expect(result.contrast).toBeGreaterThanOrEqual(MIN_CONTRAST_SCORE)
    expect(result.motion).toBeLessThanOrEqual(MAX_MOTION_SCORE)
  })

  it('rejects a moving frame even when sharp and contrast-rich', () => {
    const previous = makeCheckerboardGrayscale(width, height)
    const current = makeCheckerboardGrayscale(width, height, 2)

    const result = assessFrameQuality(current, width, height, previous)

    expect(result.acceptable).toBe(false)
    expect(result.reason).toBe('motion')
  })
})
