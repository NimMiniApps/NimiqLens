import { describe, expect, it, vi } from 'vitest'
import { fetchBalanceFromProvider, lunaToNim, nimToLuna } from './balance'

const ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

describe('lunaToNim', () => {
  it('converts luna to NIM', () => {
    expect(lunaToNim(100_000_000)).toBe(1000)
  })
})

describe('nimToLuna', () => {
  it('converts NIM to luna', () => {
    expect(nimToLuna(1000)).toBe(100_000_000)
  })
})

describe('fetchBalanceFromProvider', () => {
  it('reads balance via the Nimiq Pay provider RPC', async () => {
    const call = vi.fn().mockResolvedValueOnce({
      address: ADDRESS,
      balance: 100_000_000,
      type: 'basic',
    })
    const provider = {
      getRPC: () => ({ call }),
    }

    const result = await fetchBalanceFromProvider(provider as any, ADDRESS)

    expect(result.balance_nim).toBe(1_000)
    expect(result.address).toBe(ADDRESS)
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('throws when provider RPC is unavailable', async () => {
    await expect(fetchBalanceFromProvider({ getRPC: () => undefined } as any, ADDRESS))
      .rejects.toThrow('Wallet RPC unavailable')
  })
})
