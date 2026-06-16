import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runOcrPipeline } from './ocrPipeline'
import type { CropRect } from './scanImage'

const rect: CropRect = { x: 0, y: 0, width: 100, height: 50 }

function makeCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = 10
  canvas.height = 10
  return canvas
}

const recognizeText = vi.fn()

beforeEach(() => {
  recognizeText.mockReset()
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
      score: 95080,
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
