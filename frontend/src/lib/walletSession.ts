const WALLET_KEY = 'nimlens_wallet'

/** Skip an eager balance RPC refresh when reopening within this window. */
export const BALANCE_CACHE_MAX_AGE_MS = 2 * 60_000

export interface CachedWalletSnapshot {
  address: string
  balanceNim: number | null
  updatedAt: number
}

interface CachedWalletSnapshotInput {
  address: string
  balanceNim?: number | null
}

function parseCachedWallet(raw: string): CachedWalletSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CachedWalletSnapshot>
    if (typeof parsed.address !== 'string' || !isLikelyNimiqAddress(parsed.address)) return null
    return {
      address: parsed.address,
      balanceNim: typeof parsed.balanceNim === 'number' ? parsed.balanceNim : null,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return isLikelyNimiqAddress(raw)
      ? { address: raw, balanceNim: null, updatedAt: 0 }
      : null
  }
}

export function isCachedWalletFresh(
  snapshot: CachedWalletSnapshot,
  maxAgeMs = BALANCE_CACHE_MAX_AGE_MS,
): boolean {
  return snapshot.updatedAt > 0 && Date.now() - snapshot.updatedAt < maxAgeMs
}

export function readCachedWalletSnapshot(): CachedWalletSnapshot | null {
  try {
    const raw = localStorage.getItem(WALLET_KEY)
    return raw ? parseCachedWallet(raw) : null
  } catch {
    return null
  }
}

export function writeCachedWalletSnapshot(snapshot: CachedWalletSnapshotInput | null): void {
  try {
    if (snapshot) {
      localStorage.setItem(WALLET_KEY, JSON.stringify({
        address: snapshot.address,
        balanceNim: typeof snapshot.balanceNim === 'number' ? snapshot.balanceNim : null,
        updatedAt: Date.now(),
      }))
    } else {
      localStorage.removeItem(WALLET_KEY)
    }
  } catch {
    // Storage may be unavailable in some WebViews.
  }
}

export function readCachedWalletAddress(): string | null {
  return readCachedWalletSnapshot()?.address ?? null
}

export function writeCachedWalletAddress(address: string | null): void {
  writeCachedWalletSnapshot(address ? { address, balanceNim: null } : null)
}

/** Basic shape check for a spaced Nimiq address (NQ + 9 groups). */
export function isLikelyNimiqAddress(address: string): boolean {
  return /^NQ[0-9A-Z]{2}(\s+[0-9A-Z]{4}){8}$/i.test(address.trim())
}
