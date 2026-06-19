import type { Asset, FiatCurrency } from './convert'

export type AssetRates = Record<FiatCurrency, number>

export interface RatesResponse {
  rates: Record<Asset, AssetRates>
  timestamp: string
  fetched_at: string
  stale: boolean
  source: string
}

export interface BalanceResponse {
  address: string
  balance_nim: number
}

export interface BackendVersionResponse {
  service: string
  commit_hash: string
  build_time: string
  started_at: string
  uptime_seconds: number
}

/** Backend port when deriving the API URL from the page hostname (LAN mobile dev). */
const BACKEND_PORT = 8787

/**
 * Resolves the API base URL for fetch calls.
 * - Dev: same-origin `/api` (Vite proxies to the local backend — works from mobile LAN).
 * - Prod: uses VITE_API_BASE_URL; if that points at localhost but the page is opened via
 *   a LAN IP, uses the page hostname so phones can reach the dev machine.
 */
export function resolveApiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL ?? ''

  if (import.meta.env.DEV) return ''

  if (
    typeof window !== 'undefined' &&
    configured &&
    (configured.includes('localhost') || configured.includes('127.0.0.1'))
  ) {
    const host = window.location.hostname
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:${BACKEND_PORT}`
    }
  }

  return configured
}

export async function fetchRates(): Promise<RatesResponse> {
  const res = await fetch(`${resolveApiBase()}/api/rates`)
  if (!res.ok) throw new Error(`rates request failed: ${res.status}`)
  return res.json() as Promise<RatesResponse>
}

export async function fetchBalance(address: string): Promise<BalanceResponse> {
  const res = await fetch(`${resolveApiBase()}/api/balance/${encodeURIComponent(address)}`)
  if (!res.ok) throw new Error(`balance request failed: ${res.status}`)
  return res.json() as Promise<BalanceResponse>
}

export async function fetchBackendVersion(): Promise<BackendVersionResponse> {
  const res = await fetch(`${resolveApiBase()}/api/version`)
  if (!res.ok) throw new Error(`version request failed: ${res.status}`)
  return res.json() as Promise<BackendVersionResponse>
}
