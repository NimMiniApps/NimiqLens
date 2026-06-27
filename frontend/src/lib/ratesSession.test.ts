import { describe, expect, it, beforeEach } from 'vitest'
import { readCachedRates, writeCachedRates } from './ratesSession'
import type { RatesResponse } from './api'

const sampleRates: RatesResponse = {
  rates: {
    NIM: { EUR: 0.01, USD: 0.011, GBP: 0.009, CHF: 0.0095, JPY: 1.6, CNY: 0.078, AUD: 0.0165, CAD: 0.0148, INR: 0.9, BRL: 0.054 },
    USDT: { EUR: 0.92, USD: 1, GBP: 0.79, CHF: 0.88, JPY: 147, CNY: 7.18, AUD: 1.52, CAD: 1.36, INR: 83, BRL: 4.97 },
    BTC: { EUR: 55000, USD: 64000, GBP: 48000, CHF: 51000, JPY: 8800000, CNY: 429000, AUD: 90800, CAD: 81400, INR: 4950000, BRL: 297000 },
    ETH: { EUR: 1400, USD: 1600, GBP: 1200, CHF: 1300, JPY: 224000, CNY: 10900, AUD: 2310, CAD: 2070, INR: 126000, BRL: 7560 },
  },
  timestamp: '2026-06-13T16:30:00Z',
  fetched_at: new Date().toISOString(),
  stale: false,
  source: 'CoinGecko',
}

beforeEach(() => {
  localStorage.clear()
})

describe('ratesSession', () => {
  it('stores and reads cached rates', () => {
    writeCachedRates(sampleRates)
    expect(readCachedRates()?.source).toBe('CoinGecko')
  })

  it('expires cached rates after five minutes', () => {
    localStorage.setItem('nimlens_rates', JSON.stringify({
      rates: sampleRates,
      savedAt: Date.now() - 301_000,
    }))

    expect(readCachedRates()).toBeNull()
  })
})
