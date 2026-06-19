import { describe, it, expect, vi, beforeEach } from 'vitest'

const createWorker = vi.fn(async () => ({
  setParameters: vi.fn(async () => ({})),
  recognize: vi.fn(async () => ({
    data: {
      text: '€12.99',
      confidence: 90,
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                {
                  words: [
                    { text: '€', confidence: 70 },
                    {
                      text: '12.99',
                      confidence: 95,
                      bbox: { x0: 10, y0: 12, x1: 90, y1: 42 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  })),
  terminate: vi.fn(async () => ({})),
}))

vi.mock('tesseract.js', () => ({
  createWorker,
}))

import {
  prepareOcrWorker,
  recognizeText,
  terminateOcrWorker,
  maxDigitWordConfidence,
  maxDigitWordArea,
  PRICE_CHAR_WHITELIST,
} from './ocr'

describe('ocr worker', () => {
  beforeEach(async () => {
    await terminateOcrWorker()
    createWorker.mockClear()
  })

  it('reuses a lazily created worker across scans', async () => {
    const canvas = document.createElement('canvas')

    await recognizeText(canvas)
    await recognizeText(canvas)

    expect(createWorker).toHaveBeenCalledTimes(1)
  })

  it('returns the recognized text, page confidence, and per-word results', async () => {
    const canvas = document.createElement('canvas')

    const result = await recognizeText(canvas)

    expect(result).toEqual({
      text: '€12.99',
      confidence: 90,
      words: [
        { text: '€', confidence: 70, bbox: undefined },
        { text: '12.99', confidence: 95, bbox: { x0: 10, y0: 12, x1: 90, y1: 42 } },
      ],
    })
  })

  it('requests block-level output so word confidences are available', async () => {
    const canvas = document.createElement('canvas')
    await recognizeText(canvas)

    const worker = await createWorker.mock.results[0].value
    expect(worker.recognize).toHaveBeenCalledWith(canvas, {}, { blocks: true })
  })

  it('configures price-related characters on the worker', async () => {
    const canvas = document.createElement('canvas')
    await recognizeText(canvas)

    const worker = await createWorker.mock.results[0].value
    expect(worker.setParameters).toHaveBeenCalledWith({
      tessedit_char_whitelist: PRICE_CHAR_WHITELIST,
    })
  })

  it('loads Tesseract worker, core, and language files from same-origin app assets', async () => {
    await prepareOcrWorker()

    expect(createWorker).toHaveBeenCalledWith('eng', 1, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr/core',
      langPath: '/ocr/lang',
      workerBlobURL: false,
    })
  })

  it('terminates the worker when requested', async () => {
    const canvas = document.createElement('canvas')
    await recognizeText(canvas)

    const worker = await createWorker.mock.results[0].value
    await terminateOcrWorker()

    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('prepareOcrWorker creates the worker ahead of time', async () => {
    await prepareOcrWorker()
    expect(createWorker).toHaveBeenCalledTimes(1)
  })

  it('maxDigitWordConfidence ignores words without digits when scoring confidence', () => {
    expect(
      maxDigitWordConfidence([
        { text: 'kalkoenfiletreepjes', confidence: 20 },
        { text: '1.54', confidence: 92 },
      ]),
    ).toBe(92)
  })

  it('maxDigitWordConfidence returns 0 when no word contains a digit', () => {
    expect(maxDigitWordConfidence([{ text: 'KORTING', confidence: 85 }])).toBe(0)
  })

  it('maxDigitWordArea returns the largest digit-word box area', () => {
    expect(
      maxDigitWordArea([
        { text: 'kg', confidence: 40 },
        { text: '1.99', confidence: 80, bbox: { x0: 0, y0: 0, x1: 60, y1: 30 } },
        { text: '2.06', confidence: 95, bbox: { x0: 0, y0: 0, x1: 20, y1: 12 } },
      ]),
    ).toBe(1800)
  })

  it('retries worker creation after initialization fails', async () => {
    createWorker
      .mockRejectedValueOnce(new Error('worker failed'))
      .mockResolvedValueOnce({
        setParameters: vi.fn(async () => ({})),
        recognize: vi.fn(async () => ({
          data: {
            text: '€12.99',
            confidence: 90,
            blocks: [
              {
                paragraphs: [
                  {
                    lines: [
                      {
                        words: [
                          { text: '€', confidence: 70 },
                          { text: '12.99', confidence: 95 },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        })),
        terminate: vi.fn(async () => ({})),
      })

    await expect(prepareOcrWorker()).rejects.toThrow('worker failed')
    await expect(prepareOcrWorker()).resolves.toBeUndefined()

    expect(createWorker).toHaveBeenCalledTimes(2)
  })
})
