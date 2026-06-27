import { describe, expect, it, beforeEach } from 'vitest'
import {
  isLikelyNimiqAddress,
  isCachedWalletFresh,
  readCachedWalletSnapshot,
  readCachedWalletAddress,
  writeCachedWalletSnapshot,
  writeCachedWalletAddress,
} from './walletSession'

const ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

beforeEach(() => {
  localStorage.clear()
})

describe('walletSession', () => {
  it('stores and reads a wallet address', () => {
    writeCachedWalletAddress(ADDRESS)
    expect(readCachedWalletAddress()).toBe(ADDRESS)
  })

  it('clears a stored wallet address', () => {
    writeCachedWalletAddress(ADDRESS)
    writeCachedWalletAddress(null)
    expect(readCachedWalletAddress()).toBeNull()
  })

  it('stores and reads a wallet snapshot with balance', () => {
    writeCachedWalletSnapshot({ address: ADDRESS, balanceNim: 123.45 })

    expect(readCachedWalletSnapshot()).toMatchObject({
      address: ADDRESS,
      balanceNim: 123.45,
    })
    expect(readCachedWalletSnapshot()?.updatedAt).toEqual(expect.any(Number))
  })

  it('recognizes spaced Nimiq addresses', () => {
    expect(isLikelyNimiqAddress(ADDRESS)).toBe(true)
    expect(isLikelyNimiqAddress('not-an-address')).toBe(false)
  })

  it('treats recently saved snapshots as fresh', () => {
    writeCachedWalletSnapshot({ address: ADDRESS, balanceNim: 10 })
    const snapshot = readCachedWalletSnapshot()
    expect(snapshot).not.toBeNull()
    expect(isCachedWalletFresh(snapshot!)).toBe(true)
  })

  it('treats old snapshots as stale', () => {
    localStorage.setItem('nimlens_wallet', JSON.stringify({
      address: ADDRESS,
      balanceNim: 10,
      updatedAt: Date.now() - 5 * 60_000,
    }))
    const snapshot = readCachedWalletSnapshot()
    expect(snapshot).not.toBeNull()
    expect(isCachedWalletFresh(snapshot!)).toBe(false)
  })
})
