import type { RatesResponse } from './api'

const RATES_KEY = 'nimlens_rates'
const RATES_CACHE_MAX_AGE_MS = 5 * 60_000

interface CachedRates {
  rates: RatesResponse
  savedAt: number
}

export function readCachedRates(): RatesResponse | null {
  try {
    const raw = localStorage.getItem(RATES_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedRates>
    if (!parsed.rates || typeof parsed.savedAt !== 'number') return null
    if (Date.now() - parsed.savedAt > RATES_CACHE_MAX_AGE_MS) return null
    return parsed.rates
  } catch {
    return null
  }
}

export function writeCachedRates(rates: RatesResponse): void {
  try {
    localStorage.setItem(RATES_KEY, JSON.stringify({ rates, savedAt: Date.now() }))
  } catch {
    // Storage may be unavailable in some WebViews.
  }
}
