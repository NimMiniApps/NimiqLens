import { describe, expect, it, vi } from 'vitest'
import { purgeLocalAppData } from './appData'

import { PREFERENCES_STORAGE_KEY } from '../stores/preferences'

describe('purgeLocalAppData', () => {
  it('clears browser app stores and reloads the page', async () => {
    const reload = vi.fn()
    const cacheDelete = vi.fn()
    const unregister = vi.fn()

    localStorage.setItem('nimlens_wallet', 'NQ07')
    sessionStorage.setItem('draft', 'value')
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['runtime']),
      delete: cacheDelete,
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
      configurable: true,
    })
    Object.defineProperty(window, 'location', {
      value: { reload },
      configurable: true,
    })

    await purgeLocalAppData()

    expect(localStorage.getItem('nimlens_wallet')).toBeNull()
    expect(sessionStorage.getItem('draft')).toBeNull()
    expect(cacheDelete).toHaveBeenCalledWith('runtime')
    expect(unregister).toHaveBeenCalled()
    expect(reload).toHaveBeenCalled()
  })

  it('preserves onboarding and currency preferences', async () => {
    const reload = vi.fn()
    localStorage.setItem('nimlens_wallet', 'NQ07')
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({
      fiatCurrency: 'USD',
      onboardingComplete: true,
    }))
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: vi.fn().mockResolvedValue([]) },
      configurable: true,
    })
    Object.defineProperty(window, 'location', {
      value: { reload },
      configurable: true,
    })

    await purgeLocalAppData()

    expect(localStorage.getItem('nimlens_wallet')).toBeNull()
    expect(localStorage.getItem(PREFERENCES_STORAGE_KEY)).toContain('USD')
  })
})
