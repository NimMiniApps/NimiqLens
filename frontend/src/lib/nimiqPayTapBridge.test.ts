import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installNimiqPayTapBridge } from './nimiqPayTapBridge'

function touchEvent(type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'changedTouches', {
    value: [{ clientX: x, clientY: y }],
  })
  return event
}

describe('Nimiq Pay tap bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('delivers a synthetic click when the host intercepts normal taps', async () => {
    Object.defineProperty(window, 'nimiqPay', { value: { requestDeviceIdentifier: vi.fn() }, configurable: true })
    installNimiqPayTapBridge()

    const button = document.createElement('button')
    const icon = document.createElement('span')
    const onTap = vi.fn()
    button.addEventListener('click', onTap)
    button.append(icon)
    document.body.append(button)

    icon.dispatchEvent(touchEvent('touchstart', 20, 30))
    icon.dispatchEvent(touchEvent('touchend', 20, 30))
    await vi.advanceTimersByTimeAsync(90)

    expect(onTap).toHaveBeenCalledOnce()
  })

  it('does not deliver a duplicate click when Android also emits the native click', async () => {
    Object.defineProperty(window, 'nimiqPay', { value: { requestDeviceIdentifier: vi.fn() }, configurable: true })
    installNimiqPayTapBridge()

    const button = document.createElement('button')
    const onTap = vi.fn()
    button.addEventListener('click', onTap)
    document.body.append(button)

    button.dispatchEvent(touchEvent('touchstart', 20, 30))
    button.dispatchEvent(touchEvent('touchend', 20, 30))
    button.click()
    await vi.advanceTimersByTimeAsync(90)

    expect(onTap).toHaveBeenCalledOnce()
  })

  it('delivers a synthetic click for router-link taps', async () => {
    Object.defineProperty(window, 'nimiqPay', { value: { requestDeviceIdentifier: vi.fn() }, configurable: true })
    installNimiqPayTapBridge()

    const link = document.createElement('a')
    link.href = '/convert'
    const label = document.createElement('span')
    const onTap = vi.fn()
    link.addEventListener('click', (event) => {
      event.preventDefault()
      onTap()
    })
    link.append(label)
    document.body.append(link)

    label.dispatchEvent(touchEvent('touchstart', 10, 20))
    label.dispatchEvent(touchEvent('touchend', 10, 20))
    await vi.advanceTimersByTimeAsync(90)

    expect(onTap).toHaveBeenCalledOnce()
  })
})
