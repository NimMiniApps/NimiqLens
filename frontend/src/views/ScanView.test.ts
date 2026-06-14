import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ScanView from './ScanView.vue'

const mocks = vi.hoisted(() => ({
  recognizeText: vi.fn(),
  prepareOcrWorker: vi.fn(async () => {}),
  terminateOcrWorker: vi.fn(async () => {}),
  captureAndPreprocessTarget: vi.fn(() => [document.createElement('canvas')]),
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
    captureAndPreprocessTarget: mocks.captureAndPreprocessTarget,
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
  mocks.captureAndPreprocessTarget.mockClear()
  mocks.captureAndPreprocessTarget.mockReturnValue([document.createElement('canvas')])
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
    const wrapper = await mountWithCamera()

    expect(wrapper.find('[aria-hidden="true"] .border-dashed').exists()).toBe(true)
    expect(wrapper.text()).toContain('Point the price at the box')
  })

  it('automatically scans on a recurring interval', async () => {
    mocks.recognizeText.mockResolvedValue({ text: 'no price here', confidence: 80, words: [] })
    await mountWithCamera()

    await vi.advanceTimersByTimeAsync(1500)
    expect(mocks.captureAndPreprocessTarget).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1500)
    expect(mocks.captureAndPreprocessTarget).toHaveBeenCalledTimes(2)
  })

  it('accepts a price after two consecutive stable scans', async () => {
    mocks.recognizeText.mockResolvedValue({
      text: '€12.99',
      confidence: 80,
      words: [{ text: '12.99', confidence: 80 }],
    })
    const wrapper = await mountWithCamera()

    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()
    expect(wrapper.text()).toContain('Hold steady…')

    await vi.advanceTimersByTimeAsync(1500)
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

    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    mocks.captureAndPreprocessTarget.mockClear()
    mocks.recognizeText.mockResolvedValue({ text: 'no price here', confidence: 80, words: [] })

    await wrapper.get('[data-testid="retry"]').trigger('click')
    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()

    expect(mocks.captureAndPreprocessTarget).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="scan-now"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Detected:')
  })

  it('supports manual scan now as a fallback', async () => {
    mocks.recognizeText.mockResolvedValue({
      text: '€24.50',
      confidence: 80,
      words: [{ text: '24.50', confidence: 80 }],
    })
    const wrapper = await mountWithCamera()

    await wrapper.get('[data-testid="scan-now"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Detected: 24.5 EUR')
  })

  it('chooses the strongest valid OCR candidate across preprocessing variants', async () => {
    mocks.captureAndPreprocessTarget.mockReturnValue([
      document.createElement('canvas'),
      document.createElement('canvas'),
    ])
    mocks.recognizeText
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
    const wrapper = await mountWithCamera()

    await wrapper.get('[data-testid="scan-now"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Detected: 12.99 EUR')
  })

  it('pauses automatic scanning while the page is hidden', async () => {
    mocks.recognizeText.mockResolvedValue({ text: 'no price here', confidence: 80, words: [] })
    await mountWithCamera()

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    mocks.captureAndPreprocessTarget.mockClear()

    await vi.advanceTimersByTimeAsync(3000)
    expect(mocks.captureAndPreprocessTarget).not.toHaveBeenCalled()
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
