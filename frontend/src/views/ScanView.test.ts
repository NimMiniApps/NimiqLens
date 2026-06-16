import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ScanView from './ScanView.vue'
import type { FrameQualityResult } from '../lib/scanImage'

const LIVE_SAMPLE_INTERVAL_MS = 100

const mocks = vi.hoisted(() => ({
  recognizeText: vi.fn(),
  prepareOcrWorker: vi.fn(async () => {}),
  terminateOcrWorker: vi.fn(async () => {}),
  capturePreprocessedCrops: vi.fn(() => [
    {
      rect: { x: 0, y: 0, width: 32, height: 24 },
      variants: [document.createElement('canvas')],
    },
  ]),
  captureTargetCrop: vi.fn(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 24
    return canvas
  }),
  getGrayscaleFromCanvas: vi.fn(() => new Uint8Array(32 * 24)),
  assessFrameQuality: vi.fn((): FrameQualityResult => ({
    sharpness: 100,
    contrast: 50,
    motion: 0,
    acceptable: true,
  })),
}))

vi.mock('../lib/ocr', async () => {
  const actual = await vi.importActual<typeof import('../lib/ocr')>('../lib/ocr')
  return {
    ...actual,
    recognizeText: mocks.recognizeText,
    prepareOcrWorker: mocks.prepareOcrWorker,
    terminateOcrWorker: mocks.terminateOcrWorker,
  }
})

vi.mock('../lib/scanImage', async () => {
  const actual = await vi.importActual<typeof import('../lib/scanImage')>('../lib/scanImage')
  return {
    ...actual,
    capturePreprocessedCrops: mocks.capturePreprocessedCrops,
    captureTargetCrop: mocks.captureTargetCrop,
    getGrayscaleFromCanvas: mocks.getGrayscaleFromCanvas,
    assessFrameQuality: mocks.assessFrameQuality,
  }
})

const stubs = { RouterLink: { template: '<a><slot /></a>' } }

function mockCamera() {
  const track = { stop: vi.fn() }
  const mediaStream = { getTracks: () => [track] } as unknown as MediaStream

  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn(async () => mediaStream),
    },
  })

  HTMLMediaElement.prototype.play = vi.fn(async () => {})

  return { track, mediaStream }
}

async function mountWithCamera() {
  mockCamera()
  const wrapper = mount(ScanView, { global: { stubs } })
  await flushPromises()
  await wrapper.get('[data-testid="start-camera"]').trigger('click')
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  mocks.recognizeText.mockReset()
  mocks.prepareOcrWorker.mockClear()
  mocks.terminateOcrWorker.mockClear()
  mocks.capturePreprocessedCrops.mockClear()
  mocks.captureTargetCrop.mockClear()
  mocks.getGrayscaleFromCanvas.mockClear()
  mocks.assessFrameQuality.mockClear()
  mocks.capturePreprocessedCrops.mockReturnValue([
    {
      rect: { x: 0, y: 0, width: 32, height: 24 },
      variants: [document.createElement('canvas')],
    },
  ])
  mocks.captureTargetCrop.mockImplementation(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 24
    return canvas
  })
  mocks.getGrayscaleFromCanvas.mockReturnValue(new Uint8Array(32 * 24))
  mocks.assessFrameQuality.mockReturnValue({
    sharpness: 100,
    contrast: 50,
    motion: 0,
    acceptable: true,
  } satisfies FrameQualityResult)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ScanView', () => {
  it('shows the on-device privacy note', () => {
    const wrapper = mount(ScanView, { global: { stubs } })
    expect(wrapper.text()).toContain('processed entirely on your device')
  })

  it('shows a fallback message when the camera is unavailable', () => {
    const wrapper = mount(ScanView, { global: { stubs } })
    expect(wrapper.text()).toContain("Camera access isn't available")
  })

  it('explains that an insecure mobile origin blocks camera access', () => {
    vi.stubGlobal('isSecureContext', false)

    const wrapper = mount(ScanView, { global: { stubs } })

    expect(wrapper.text()).toContain('Camera access requires HTTPS on mobile')
  })

  it('always offers manual price entry', () => {
    const wrapper = mount(ScanView, { global: { stubs } })
    expect(wrapper.text()).toContain('Enter price manually')
  })

  it('lets the user choose the currency used for bare scanned prices', () => {
    const wrapper = mount(ScanView, { global: { stubs } })
    expect(wrapper.text()).toContain('Scan currency')
    expect(wrapper.find('select').exists()).toBe(true)
  })

  it('shows the target overlay while the camera is active', async () => {
    mocks.recognizeText.mockImplementation(() => new Promise(() => {}))
    const wrapper = await mountWithCamera()

    expect(wrapper.find('[aria-hidden="true"] .border-dashed').exists()).toBe(true)
    expect(wrapper.text()).toContain('Point the price at the box')
  })

  it('starts OCR on the first good frame without waiting 1500ms', async () => {
    mocks.recognizeText.mockResolvedValue({ text: 'no price here', confidence: 80, words: [] })
    await mountWithCamera()

    await flushPromises()
    expect(mocks.capturePreprocessedCrops).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(LIVE_SAMPLE_INTERVAL_MS)
    await flushPromises()
    expect(mocks.capturePreprocessedCrops).toHaveBeenCalledTimes(2)
  })

  it('does not trigger OCR when frame quality is too low', async () => {
    mocks.assessFrameQuality.mockReturnValue({
      sharpness: 5,
      contrast: 5,
      motion: 0,
      acceptable: false,
      reason: 'blur',
    })
    mocks.recognizeText.mockResolvedValue({ text: 'no price here', confidence: 80, words: [] })
    await mountWithCamera()

    await vi.advanceTimersByTimeAsync(LIVE_SAMPLE_INTERVAL_MS * 5)
    await flushPromises()

    expect(mocks.captureTargetCrop).toHaveBeenCalled()
    expect(mocks.capturePreprocessedCrops).not.toHaveBeenCalled()
    expect(mocks.recognizeText).not.toHaveBeenCalled()
  })

  it('triggers OCR as soon as the scheduler sees a good frame', async () => {
    mocks.assessFrameQuality
      .mockReturnValueOnce({
        sharpness: 5,
        contrast: 5,
        motion: 0,
        acceptable: false,
        reason: 'blur',
      })
      .mockReturnValue({
        sharpness: 100,
        contrast: 50,
        motion: 0,
        acceptable: true,
      })
    mocks.recognizeText.mockResolvedValue({ text: 'no price here', confidence: 80, words: [] })
    await mountWithCamera()

    await flushPromises()
    expect(mocks.capturePreprocessedCrops).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(LIVE_SAMPLE_INTERVAL_MS)
    await flushPromises()
    expect(mocks.capturePreprocessedCrops).toHaveBeenCalledTimes(1)
  })

  it('accepts a price after two consecutive stable scans', async () => {
    mocks.recognizeText.mockResolvedValue({
      text: '€12.99',
      confidence: 80,
      words: [{ text: '12.99', confidence: 80 }],
    })
    const wrapper = await mountWithCamera()
    await flushPromises()
    expect(wrapper.text()).toContain('Hold steady…')

    await vi.advanceTimersByTimeAsync(LIVE_SAMPLE_INTERVAL_MS)
    await flushPromises()

    expect(wrapper.text()).toContain('Detected: 12.99 EUR')
  })

  it('accepts a price even when surrounding shelf-label text drags down the page confidence', async () => {
    mocks.recognizeText.mockResolvedValue({
      text: 'AH KALKOENFILETREEPJES\n1.54\nPER KG\n40% KORTING',
      confidence: 35,
      words: [
        { text: 'AH', confidence: 20 },
        { text: 'KALKOENFILETREEPJES', confidence: 18 },
        { text: '1.54', confidence: 92 },
        { text: 'PER', confidence: 25 },
        { text: 'KG', confidence: 30 },
        { text: '40%', confidence: 22 },
        { text: 'KORTING', confidence: 19 },
      ],
    })
    const wrapper = await mountWithCamera()

    await wrapper.get('[data-testid="scan-now"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Detected: 1.54 EUR')
  })

  it('asks the user to move closer when OCR confidence is too low to trust', async () => {
    mocks.recognizeText.mockResolvedValue({
      text: '€12.99',
      confidence: 40,
      words: [{ text: '12.99', confidence: 40 }],
    })
    const wrapper = await mountWithCamera()

    await wrapper.get('[data-testid="scan-now"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('Detected:')
    expect(wrapper.text()).toContain('Move closer to the price')
  })

  it('resumes automatic scanning after retry', async () => {
    mocks.recognizeText.mockResolvedValue({
      text: '€12.99',
      confidence: 80,
      words: [{ text: '12.99', confidence: 80 }],
    })
    const wrapper = await mountWithCamera()

    await vi.advanceTimersByTimeAsync(LIVE_SAMPLE_INTERVAL_MS * 2)
    await flushPromises()
    mocks.capturePreprocessedCrops.mockClear()
    mocks.recognizeText.mockResolvedValue({ text: 'no price here', confidence: 80, words: [] })

    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(LIVE_SAMPLE_INTERVAL_MS)
    await flushPromises()

    expect(mocks.capturePreprocessedCrops).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="scan-now"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Detected:')
  })

  it('supports manual scan now as a fallback without waiting for frame quality', async () => {
    mocks.assessFrameQuality.mockReturnValue({
      sharpness: 5,
      contrast: 5,
      motion: 0,
      acceptable: false,
      reason: 'blur',
    })
    mocks.recognizeText.mockResolvedValue({
      text: '€24.50',
      confidence: 80,
      words: [{ text: '24.50', confidence: 80 }],
    })
    const wrapper = await mountWithCamera()

    await wrapper.get('[data-testid="scan-now"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Detected: 24.5 EUR')
    expect(mocks.capturePreprocessedCrops).toHaveBeenCalled()
  })

  it('chooses the strongest valid OCR candidate across preprocessing variants', async () => {
    const wrapper = await mountWithCamera()
    mocks.capturePreprocessedCrops.mockReturnValue([
      {
        rect: { x: 0, y: 0, width: 32, height: 24 },
        variants: [document.createElement('canvas'), document.createElement('canvas')],
      },
    ])
    mocks.recognizeText
      .mockReset()
      .mockResolvedValueOnce({
        text: '€12.00',
        confidence: 62,
        words: [{ text: '12.00', confidence: 62 }],
      })
      .mockResolvedValueOnce({
        text: '€12.99',
        confidence: 95,
        words: [{ text: '12.99', confidence: 95 }],
      })

    await wrapper.get('[data-testid="scan-now"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Detected: 12.99 EUR')
  })

  it('does not run parallel OCR jobs while one is in flight', async () => {
    let resolveOcr: (value: unknown) => void = () => {}
    mocks.recognizeText.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOcr = resolve
        }),
    )
    await mountWithCamera()

    await flushPromises()
    expect(mocks.capturePreprocessedCrops).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(LIVE_SAMPLE_INTERVAL_MS * 3)
    await flushPromises()
    expect(mocks.capturePreprocessedCrops).toHaveBeenCalledTimes(1)

    resolveOcr({ text: 'no price here', confidence: 80, words: [] })
    await flushPromises()

    await vi.advanceTimersByTimeAsync(LIVE_SAMPLE_INTERVAL_MS)
    await flushPromises()
    expect(mocks.capturePreprocessedCrops).toHaveBeenCalledTimes(2)
  })

  it('pauses automatic scanning while the page is hidden', async () => {
    mocks.recognizeText.mockResolvedValue({ text: 'no price here', confidence: 80, words: [] })
    await mountWithCamera()

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    mocks.capturePreprocessedCrops.mockClear()
    mocks.captureTargetCrop.mockClear()

    await vi.advanceTimersByTimeAsync(LIVE_SAMPLE_INTERVAL_MS * 5)
    expect(mocks.captureTargetCrop).not.toHaveBeenCalled()
    expect(mocks.capturePreprocessedCrops).not.toHaveBeenCalled()
  })

  it('maps blur guidance to user-facing copy', async () => {
    mocks.assessFrameQuality.mockReturnValue({
      sharpness: 5,
      contrast: 5,
      motion: 0,
      acceptable: false,
      reason: 'blur',
    })
    const wrapper = await mountWithCamera()

    await flushPromises()
    expect(wrapper.text()).toContain('Image is blurry — hold steady')
  })

  it('maps low-contrast guidance to user-facing copy', async () => {
    mocks.assessFrameQuality.mockReturnValue({
      sharpness: 100,
      contrast: 5,
      motion: 0,
      acceptable: false,
      reason: 'low-contrast',
    })
    const wrapper = await mountWithCamera()

    await flushPromises()
    expect(wrapper.text()).toContain('Improve lighting or move closer')
  })

  it('maps motion guidance to hold-steady copy', async () => {
    mocks.assessFrameQuality.mockReturnValue({
      sharpness: 100,
      contrast: 50,
      motion: 30,
      acceptable: false,
      reason: 'motion',
    })
    const wrapper = await mountWithCamera()

    await flushPromises()
    expect(wrapper.text()).toContain('Hold steady…')
  })

  it('pauses the live loop after a stable detection', async () => {
    mocks.recognizeText.mockResolvedValue({
      text: '€12.99',
      confidence: 80,
      words: [{ text: '12.99', confidence: 80 }],
    })
    const wrapper = await mountWithCamera()

    await vi.advanceTimersByTimeAsync(LIVE_SAMPLE_INTERVAL_MS * 2)
    await flushPromises()
    expect(wrapper.text()).toContain('Detected: 12.99 EUR')

    mocks.capturePreprocessedCrops.mockClear()
    mocks.captureTargetCrop.mockClear()
    await vi.advanceTimersByTimeAsync(LIVE_SAMPLE_INTERVAL_MS * 5)
    expect(mocks.captureTargetCrop).not.toHaveBeenCalled()
    expect(mocks.capturePreprocessedCrops).not.toHaveBeenCalled()
  })

  it('shows an initialization error and retries OCR when the camera starts', async () => {
    mocks.prepareOcrWorker
      .mockRejectedValueOnce(new Error('worker failed'))
      .mockResolvedValueOnce(undefined)
    mockCamera()
    const wrapper = mount(ScanView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('Scanner unavailable: worker failed')

    await wrapper.get('[data-testid="start-camera"]').trigger('click')
    await flushPromises()

    expect(mocks.prepareOcrWorker).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Scanner unavailable')
    expect(wrapper.find('[data-testid="scan-now"]').exists()).toBe(true)
  })
})
