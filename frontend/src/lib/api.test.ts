import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchRates, fetchBalance, fetchBackendVersion, resolveApiBase } from './api'

const sampleRates = {
  rates: {
    NIM: { EUR: 0.01, USD: 0.011, GBP: 0.009, CHF: 0.0095, JPY: 1.6, CNY: 0.078, AUD: 0.0165, CAD: 0.0148, INR: 0.9, BRL: 0.054 },
    USDT: { EUR: 0.92, USD: 1.0, GBP: 0.79, CHF: 0.88, JPY: 147, CNY: 7.18, AUD: 1.52, CAD: 1.36, INR: 83, BRL: 4.97 },
    BTC: { EUR: 55000, USD: 64000, GBP: 48000, CHF: 51000, JPY: 8800000, CNY: 429000, AUD: 90800, CAD: 81400, INR: 4950000, BRL: 297000 },
    ETH: { EUR: 1400, USD: 1600, GBP: 1200, CHF: 1300, JPY: 224000, CNY: 10900, AUD: 2310, CAD: 2070, INR: 126000, BRL: 7560 },
  },
  timestamp: '2026-06-13T16:30:00Z',
  fetched_at: '2026-06-13T16:30:00Z',
  stale: false,
  source: 'CoinGecko',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveApiBase', () => {
  it('uses same-origin requests in dev mode', () => {
    expect(resolveApiBase()).toBe('')
  })
})

describe('fetchRates', () => {
  it('returns parsed rates on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sampleRates), { status: 200 })))

    const result = await fetchRates()
    expect(result.source).toBe('CoinGecko')
    expect(result.rates.NIM.EUR).toBe(0.01)
  })

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))

    await expect(fetchRates()).rejects.toThrow('rates request failed: 503')
  })
})

describe('fetchBalance', () => {
  it('returns parsed balance on success', async () => {
    const body = { address: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000', balance_nim: 123.45 }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))

    const result = await fetchBalance('NQ07 0000 0000 0000 0000 0000 0000 0000 0000')
    expect(result.balance_nim).toBe(123.45)
  })

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))

    await expect(fetchBalance('NQ07')).rejects.toThrow('balance request failed: 503')
  })
})

describe('fetchBackendVersion', () => {
  it('returns parsed backend version metadata on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      service: 'nimlens-backend',
      commit_hash: 'abc1234',
      build_time: '2026-06-20T00:00:00Z',
      started_at: '2026-06-20T00:01:00Z',
      uptime_seconds: 60,
    }), { status: 200 })))

    const result = await fetchBackendVersion()

    expect(result.commit_hash).toBe('abc1234')
    expect(result.uptime_seconds).toBe(60)
  })

  it('throws when backend version is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))

    await expect(fetchBackendVersion()).rejects.toThrow('version request failed: 503')
  })
})
