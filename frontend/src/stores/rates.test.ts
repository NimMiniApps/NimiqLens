import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRatesStore } from './rates'
import * as api from '../lib/api'
import { writeCachedRates } from '../lib/ratesSession'

const sampleRates: api.RatesResponse = {
  rates: {
    NIM: { EUR: 0.01, USD: 0.011, GBP: 0.009, CHF: 0.0095, JPY: 1.6, CNY: 0.078, AUD: 0.0165, CAD: 0.0148, INR: 0.9, BRL: 0.054 },
    USDT: { EUR: 0.92, USD: 1.0, GBP: 0.79, CHF: 0.88, JPY: 147, CNY: 7.18, AUD: 1.52, CAD: 1.36, INR: 83, BRL: 4.97 },
    BTC: { EUR: 55000, USD: 64000, GBP: 48000, CHF: 51000, JPY: 8800000, CNY: 429000, AUD: 90800, CAD: 81400, INR: 4950000, BRL: 297000 },
    ETH: { EUR: 1400, USD: 1600, GBP: 1200, CHF: 1300, JPY: 224000, CNY: 10900, AUD: 2310, CAD: 2070, INR: 126000, BRL: 7560 },
  },
  timestamp: '2026-06-13T16:30:00Z',
  fetched_at: new Date().toISOString(),
  stale: false,
  source: 'CoinGecko',
}

const EXPECTED_REFRESH_AFTER_MS = 45_000

beforeEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  setActivePinia(createPinia())
  vi.restoreAllMocks()
})

describe('useRatesStore', () => {
  it('hydrates from cached rates without fetching', () => {
    writeCachedRates(sampleRates)
    const fetchRates = vi.spyOn(api, 'fetchRates')

    const store = useRatesStore()

    expect(store.rates?.source).toBe('CoinGecko')
    expect(fetchRates).not.toHaveBeenCalled()
  })

  it('loads rates and is not stale right after loading', async () => {
    vi.spyOn(api, 'fetchRates').mockResolvedValue(sampleRates)

    const store = useRatesStore()
    await store.load()

    expect(store.rates?.source).toBe('CoinGecko')
    expect(store.error).toBeNull()
    expect(store.isStale).toBe(false)
  })

  it('records an error and keeps cached rates when the fetch fails', async () => {
    writeCachedRates(sampleRates)
    vi.spyOn(api, 'fetchRates').mockRejectedValue(new Error('rates request failed: 503'))

    const store = useRatesStore()
    await store.load()

    expect(store.rates?.source).toBe('CoinGecko')
    expect(store.error).toBe('rates request failed: 503')
  })

  it('records an error and leaves rates null when the fetch fails without a cache', async () => {
    vi.spyOn(api, 'fetchRates').mockRejectedValue(new Error('rates request failed: 503'))

    const store = useRatesStore()
    await store.load()

    expect(store.rates).toBeNull()
    expect(store.error).toBe('rates request failed: 503')
  })

  it('treats rates as stale once the backend marks them stale', async () => {
    vi.spyOn(api, 'fetchRates').mockResolvedValue({ ...sampleRates, stale: true })

    const store = useRatesStore()
    await store.load()

    expect(store.isStale).toBe(true)
  })

  it('keeps backend-cached rates fresh long enough for auto refresh to replace them', async () => {
    const old = new Date(Date.now() - 61_000).toISOString()
    vi.spyOn(api, 'fetchRates').mockResolvedValue({ ...sampleRates, fetched_at: old })

    const store = useRatesStore()
    await store.load()

    expect(store.isStale).toBe(false)
  })

  it('treats rates as stale once fetched_at is older than five minutes', async () => {
    const old = new Date(Date.now() - 301_000).toISOString()
    vi.spyOn(api, 'fetchRates').mockResolvedValue({ ...sampleRates, fetched_at: old })

    const store = useRatesStore()
    await store.load()

    expect(store.isStale).toBe(true)
  })

  it('automatically refreshes rates from the backend', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T16:30:00Z'))
    const fetchRates = vi.spyOn(api, 'fetchRates')
      .mockResolvedValueOnce(sampleRates)
      .mockResolvedValueOnce({
        ...sampleRates,
        fetched_at: new Date(Date.now() + EXPECTED_REFRESH_AFTER_MS).toISOString(),
      })

    const store = useRatesStore()
    await store.load()
    await vi.advanceTimersByTimeAsync(EXPECTED_REFRESH_AFTER_MS)

    expect(fetchRates).toHaveBeenCalledTimes(2)
  })
})
