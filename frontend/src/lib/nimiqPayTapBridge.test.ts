import { describe, expect, it, vi } from 'vitest'
import { installNimiqPayTapBridge } from './nimiqPayTapBridge'

function touchEvent(type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'changedTouches', {
    value: [{ clientX: x, clientY: y }],
  })
  return event
}

describe('Nimiq Pay tap bridge', () => {
  it('delivers a synthetic click when the host intercepts normal taps', () => {
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

    expect(onTap).toHaveBeenCalledOnce()
  })

  it('prevents the native WebView click so Android does not double-submit actions', () => {
    Object.defineProperty(window, 'nimiqPay', { value: { requestDeviceIdentifier: vi.fn() }, configurable: true })
    installNimiqPayTapBridge()

    const button = document.createElement('button')
    const onTap = vi.fn()
    button.addEventListener('click', onTap)
    document.body.append(button)

    const end = touchEvent('touchend', 20, 30)
    button.dispatchEvent(touchEvent('touchstart', 20, 30))
    button.dispatchEvent(end)

    expect(onTap).toHaveBeenCalledOnce()
    expect(end.defaultPrevented).toBe(true)
  })

  it('delivers a synthetic click for router-link taps', () => {
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

    expect(onTap).toHaveBeenCalledOnce()
  })
})
