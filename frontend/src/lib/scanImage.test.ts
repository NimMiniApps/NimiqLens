import { describe, it, expect, beforeEach } from 'vitest'
import {
  TARGET_HEIGHT_RATIO,
  TARGET_WIDTH_RATIO,
  PREPROCESS_SCALE,
  DISPLAY_ASPECT_RATIO,
  getTargetCropRect,
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

  it('returns 2x scaled processed variants', () => {
    const variants = preprocessTargetRegion(source)

    expect(variants.length).toBeGreaterThan(0)
    for (const variant of variants) {
      expect(variant.width).toBe(source.width * PREPROCESS_SCALE)
      expect(variant.height).toBe(source.height * PREPROCESS_SCALE)
    }
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
})
