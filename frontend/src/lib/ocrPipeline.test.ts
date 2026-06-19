import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runOcrPipeline } from './ocrPipeline'
import type { CropRect } from './scanImage'
import * as priceRegions from './priceRegions'

const rect: CropRect = { x: 0, y: 0, width: 100, height: 50 }

function makeCanvas(width = 10, height = 10) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx!.fillStyle = '#fff'
  ctx?.fillRect(0, 0, width, height)
  return canvas
}


const recognizeText = vi.fn()

beforeEach(() => {
  recognizeText.mockReset()
})

describe('runOcrPipeline region ranking', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prefers the center-most candidate over a larger off-center candidate', async () => {
    const canvas = makeCanvas(100, 50)
    vi.spyOn(priceRegions, 'extractCandidateRegionsFromVariant').mockReturnValue([
      { bbox: { x: 85, y: 10, width: 24, height: 24 }, centerX: 97, centerY: 22, area: 576 },
      { bbox: { x: 38, y: 12, width: 22, height: 20 }, centerX: 49, centerY: 22, area: 440 },
    ])

    recognizeText.mockImplementation(async (target: HTMLCanvasElement) => {
      if (target.width >= 50) {
        return { text: '€12.99', confidence: 80, words: [{ text: '€12.99', confidence: 82 }] }
      }
      return { text: '€3.99', confidence: 95, words: [{ text: '€3.99', confidence: 95 }] }
    })

    const result = await runOcrPipeline(
      [{ rect, variants: [canvas] }],
      'EUR',
      recognizeText,
    )

    expect(result.winner?.parsed).toEqual({ amount: 3.99, currency: 'EUR' })
  })

  it('down-ranks an isolated integer when a split-cents layout exists nearby', async () => {
    const canvas = makeCanvas(140, 40)
    vi.spyOn(priceRegions, 'extractCandidateRegionsFromVariant').mockReturnValue([
      { bbox: { x: 8, y: 8, width: 8, height: 16 }, centerX: 12, centerY: 16, area: 128 },
      { bbox: { x: 18, y: 6, width: 28, height: 24 }, centerX: 32, centerY: 18, area: 672 },
      { bbox: { x: 50, y: 8, width: 14, height: 14 }, centerX: 57, centerY: 15, area: 196 },
      { bbox: { x: 95, y: 6, width: 30, height: 24 }, centerX: 110, centerY: 18, area: 720 },
    ])

    recognizeText.mockImplementation(async (target: HTMLCanvasElement) => {
      if (target.width >= 34) {
        return { text: '$900', confidence: 95, words: [{ text: '$900', confidence: 95 }] }
      }
      if (target.width <= 12) {
        return { text: '$', confidence: 80, words: [{ text: '$', confidence: 80 }] }
      }
      if (target.width <= 20) {
        return { text: '95', confidence: 88, words: [{ text: '95', confidence: 88 }] }
      }
      return { text: '299', confidence: 90, words: [{ text: '299', confidence: 92 }] }
    })

    const result = await runOcrPipeline(
      [{ rect, variants: [canvas] }],
      'USD',
      recognizeText,
    )

    expect(result.winner?.parsed).toEqual({ amount: 299.95, currency: 'USD' })
  })
})

describe('runOcrPipeline', () => {
  it('scores OCR candidates across crops and variants and returns the strongest parsed winner', async () => {
    const crop0Variants = [makeCanvas(), makeCanvas()]
    const crop1Variants = [makeCanvas(), makeCanvas()]

    recognizeText
      .mockResolvedValueOnce({ text: 'no price', confidence: 90, words: [{ text: 'no', confidence: 90 }] })
      .mockResolvedValueOnce({ text: '€12.99', confidence: 70, words: [{ text: '€12.99', confidence: 88 }] })
      .mockResolvedValueOnce({ text: '€3.99', confidence: 80, words: [{ text: '€3.99', confidence: 95 }] })
      .mockResolvedValueOnce({ text: '€1.00', confidence: 60, words: [{ text: '€1.00', confidence: 50 }] })

    const result = await runOcrPipeline(
      [
        { rect, variants: crop0Variants },
        { rect, variants: crop1Variants },
      ],
      'EUR',
      recognizeText,
    )

    expect(result.winner).toEqual({
      cropIndex: 1,
      variantIndex: 0,
      parsed: { amount: 3.99, currency: 'EUR' },
      score: expect.any(Number),
      text: '€3.99',
      centerDistance: expect.any(Number),
    })
  })

  it('reports rejected variants with confidence and parse metadata', async () => {
    recognizeText
      .mockResolvedValueOnce({ text: 'SPECIAL', confidence: 85, words: [{ text: 'SPECIAL', confidence: 85 }] })
      .mockResolvedValueOnce({ text: '12.99', confidence: 40, words: [{ text: '12.99', confidence: 55 }] })

    const result = await runOcrPipeline(
      [{ rect, variants: [makeCanvas(), makeCanvas()] }],
      'EUR',
      recognizeText,
    )

    expect(result.crops[0].variants[0]).toMatchObject({
      rejected: true,
      text: 'SPECIAL',
      confidence: 85,
      digitConfidence: 0,
      parsed: null,
    })
    expect(result.crops[0].variants[1]).toMatchObject({
      rejected: true,
      text: '12.99',
      confidence: 40,
      digitConfidence: 55,
      parsed: null,
    })
    expect(result.winner).toBeNull()
  })

  it('prefers a cleaner isolated price over a noisier higher-confidence parse', async () => {
    const crop0Variants = [makeCanvas()]
    const crop1Variants = [makeCanvas()]

    recognizeText
      .mockResolvedValueOnce({
        text: '- I B\nEILLIGS\n1 BE\nRR . 5199\nAr, 87 2.06\n',
        confidence: 27,
        words: [{ text: '2.06', confidence: 96 }],
      })
      .mockResolvedValueOnce({
        text: '1.99\n- ¥ - .\n',
        confidence: 60,
        words: [{ text: '1.99', confidence: 78 }],
      })

    const result = await runOcrPipeline(
      [
        { rect, variants: crop0Variants },
        { rect, variants: crop1Variants },
      ],
      'EUR',
      recognizeText,
    )

    expect(result.winner?.cropIndex).toBe(1)
    expect(result.winner?.parsed).toEqual({ amount: 1.99, currency: 'EUR' })
  })

  it('prefers a larger price digit cluster over a smaller side-digit cluster', async () => {
    const crop0Variants = [makeCanvas()]
    const crop1Variants = [makeCanvas()]

    recognizeText
      .mockResolvedValueOnce({
        text: '2.06',
        confidence: 88,
        words: [{ text: '2.06', confidence: 93, bbox: { x0: 0, y0: 0, x1: 20, y1: 10 } }],
      })
      .mockResolvedValueOnce({
        text: '1.99',
        confidence: 75,
        words: [{ text: '1.99', confidence: 82, bbox: { x0: 0, y0: 0, x1: 90, y1: 36 } }],
      })

    const result = await runOcrPipeline(
      [
        { rect, variants: crop0Variants },
        { rect, variants: crop1Variants },
      ],
      'EUR',
      recognizeText,
    )

    expect(result.winner?.cropIndex).toBe(1)
    expect(result.winner?.parsed).toEqual({ amount: 1.99, currency: 'EUR' })
  })
})
