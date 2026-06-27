import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWalletStore, TIP_AMOUNT_LUNA } from './wallet'
import * as nimiq from '../lib/nimiq'
import * as api from '../lib/api'
import {
  readCachedWalletAddress,
  readCachedWalletSnapshot,
  writeCachedWalletSnapshot,
} from '../lib/walletSession'

const ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'
const TOPUP_ADDRESS = 'NQ08 1111 1111 1111 1111 1111 1111 1111 1111'
const WALLET_ADDRESS = 'NQ09 2222 2222 2222 2222 2222 2222 2222 2222'

beforeEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  setActivePinia(createPinia())
  vi.restoreAllMocks()
})

describe('useWalletStore', () => {
  it('marks isInsideNimiqPay true when the provider initializes', async () => {
    vi.spyOn(nimiq, 'initNimiq').mockResolvedValue({ listAccounts: vi.fn() } as any)

    const store = useWalletStore()
    await store.init()

    expect(store.isInsideNimiqPay).toBe(true)
    expect(store.initialized).toBe(true)
  })

  it('marks isInsideNimiqPay false when the provider is unavailable', async () => {
    vi.spyOn(nimiq, 'initNimiq').mockResolvedValue(null)

    const store = useWalletStore()
    await store.init()

    expect(store.isInsideNimiqPay).toBe(false)
    expect(store.initialized).toBe(true)
  })

  it('initializes the provider without requesting account access before a user action', async () => {
    const listAccounts = vi.fn().mockResolvedValue([ADDRESS])
    vi.spyOn(nimiq, 'initNimiq').mockResolvedValue({ listAccounts } as any)

    const store = useWalletStore()
    await store.init()

    expect(listAccounts).not.toHaveBeenCalled()
    expect(store.address).toBeNull()
  })

  it('restores a cached wallet snapshot on init without requesting account access', async () => {
    writeCachedWalletSnapshot({ address: ADDRESS, balanceNim: 99.12 })
    const listAccounts = vi.fn()
    vi.spyOn(nimiq, 'initNimiq').mockResolvedValue({ listAccounts } as any)

    const store = useWalletStore()
    expect(store.address).toBe(ADDRESS)
    expect(store.balanceNim).toBe(99.12)
    expect(store.sessionRestored).toBe(true)

    await store.init()

    expect(listAccounts).not.toHaveBeenCalled()
  })

  it('hydrates cached wallet state before the provider finishes initializing', async () => {
    writeCachedWalletSnapshot({ address: ADDRESS, balanceNim: 99.12 })
    let resolveInit!: (value: unknown) => void
    const initPromise = new Promise((resolve) => {
      resolveInit = resolve
    })
    vi.spyOn(nimiq, 'initNimiq').mockReturnValue(initPromise as ReturnType<typeof nimiq.initNimiq>)

    const store = useWalletStore()
    expect(store.initialized).toBe(true)
    expect(store.address).toBe(ADDRESS)
    expect(store.balanceNim).toBe(99.12)

    const initTask = store.init()
    resolveInit({ listAccounts: vi.fn() })
    await initTask
  })

  it('skips balance refresh on init when the cached snapshot is still fresh', async () => {
    writeCachedWalletSnapshot({ address: ADDRESS, balanceNim: 99.12 })
    const initNimiq = vi.spyOn(nimiq, 'initNimiq')

    const store = useWalletStore()
    await store.init()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(initNimiq).not.toHaveBeenCalled()
  })

  it('refreshes a restored wallet balance through RPC without requesting account access', async () => {
    localStorage.setItem('nimlens_wallet', JSON.stringify({
      address: ADDRESS,
      balanceNim: 99.12,
      updatedAt: Date.now() - 5 * 60_000,
    }))
    const listAccounts = vi.fn()
    const call = vi.fn().mockResolvedValueOnce({
      address: ADDRESS,
      balance: 125_000_000,
      type: 'basic',
    })
    vi.spyOn(nimiq, 'initNimiq').mockResolvedValue({
      listAccounts,
      getRPC: () => ({ call }),
    } as any)

    const store = useWalletStore()
    await store.init()
    await vi.waitFor(() => expect(store.balanceNim).toBe(1250))

    expect(listAccounts).not.toHaveBeenCalled()
    expect(call).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      method: 'getAccountByAddress',
      params: [ADDRESS],
    })
    expect(readCachedWalletSnapshot()).toMatchObject({
      address: ADDRESS,
      balanceNim: 1250,
    })
  })

  it('persists the wallet address after a successful connect', async () => {
    vi.spyOn(nimiq, 'initNimiq').mockResolvedValue({
      listAccounts: vi.fn().mockResolvedValue([ADDRESS]),
    } as any)
    vi.spyOn(api, 'fetchBalance').mockResolvedValue({ address: ADDRESS, balance_nim: 123.45 })

    const store = useWalletStore()
    await store.init()
    await store.connect()

    expect(readCachedWalletAddress()).toBe(ADDRESS)
  })

  it('does not wrap the SDK provider class in a reactive proxy', async () => {
    class PrivateFieldProvider {
      #accounts = [ADDRESS]

      async listAccounts() {
        return this.#accounts
      }
    }

    vi.spyOn(nimiq, 'initNimiq').mockResolvedValue(new PrivateFieldProvider() as any)
    vi.spyOn(api, 'fetchBalance').mockResolvedValue({ address: ADDRESS, balance_nim: 123.45 })

    const store = useWalletStore()
    await store.init()
    await store.connect()

    expect(store.address).toBe(ADDRESS)
    expect(store.connectionError).toBeNull()
  })

  it('records a retryable connection error when account access fails', async () => {
    vi.spyOn(nimiq, 'initNimiq').mockResolvedValue({
      listAccounts: vi.fn().mockRejectedValue(new Error('User rejected')),
    } as any)

    const store = useWalletStore()
    await store.init()
    await store.connect()

    expect(store.address).toBeNull()
    expect(store.connecting).toBe(false)
    expect(store.connectionError).toBe('User rejected')
  })

  it('stops waiting and offers a retry when Nimiq Pay does not answer', async () => {
    vi.useFakeTimers()
    vi.spyOn(nimiq, 'initNimiq').mockResolvedValue({
      listAccounts: vi.fn().mockReturnValue(new Promise(() => {})),
    } as any)

    const store = useWalletStore()
    const initTask = store.init()
    await vi.advanceTimersByTimeAsync(0)
    await initTask
    const connection = store.connect()
    await vi.advanceTimersByTimeAsync(15_000)
    await connection

    expect(store.connecting).toBe(false)
    expect(store.connectionError).toBe('Nimiq Pay did not respond. Try again.')
  })

  it('loads balance through Nimiq Pay RPC when available', async () => {
    vi.spyOn(api, 'fetchBalance')
    const call = vi.fn().mockResolvedValueOnce({
      address: ADDRESS,
      balance: 100_000_000,
      type: 'basic',
    })
    vi.spyOn(nimiq, 'initNimiq').mockResolvedValue({
      listAccounts: vi.fn().mockResolvedValue([ADDRESS]),
      getRPC: () => ({ call }),
    } as any)

    const store = useWalletStore()
    await store.init()
    await store.connect()

    expect(store.balanceNim).toBe(1000)
    expect(api.fetchBalance).not.toHaveBeenCalled()
  })

  it('selects the listed account with the highest wallet RPC balance instead of the top-up account', async () => {
    const call = vi.fn(async ({ params: [address] }) => ({
      address,
      balance: address === WALLET_ADDRESS ? 100_100_000 : 0,
      type: 'basic',
    }))
    vi.spyOn(nimiq, 'initNimiq').mockResolvedValue({
      listAccounts: vi.fn().mockResolvedValue([TOPUP_ADDRESS, WALLET_ADDRESS]),
      getRPC: () => ({ call }),
    } as any)

    const store = useWalletStore()
    await store.init()
    await store.connect()

    expect(store.address).toBe(WALLET_ADDRESS)
    expect(store.balanceNim).toBe(1001)
    expect(readCachedWalletAddress()).toBe(WALLET_ADDRESS)
    expect(readCachedWalletSnapshot()).toMatchObject({
      address: WALLET_ADDRESS,
      balanceNim: 1001,
    })
  })

  it('connects, stores the shortened address, and loads the balance', async () => {
    vi.spyOn(nimiq, 'initNimiq').mockResolvedValue({
      listAccounts: vi.fn().mockResolvedValue([ADDRESS]),
    } as any)
    vi.spyOn(api, 'fetchBalance').mockResolvedValue({ address: ADDRESS, balance_nim: 123.45 })

    const store = useWalletStore()
    await store.init()
    await store.connect()

    expect(store.address).toBe(ADDRESS)
    expect(store.shortAddress).toBe('NQ07 **** **** 0000')
    expect(store.balanceNim).toBe(123.45)
    expect(store.balanceError).toBeNull()
  })

  it('records balanceError and clears balanceNim when the balance fetch fails', async () => {
    vi.spyOn(nimiq, 'initNimiq').mockResolvedValue({
      listAccounts: vi.fn().mockResolvedValue([ADDRESS]),
    } as any)
    vi.spyOn(api, 'fetchBalance').mockRejectedValue(new Error('balance request failed: 503'))

    const store = useWalletStore()
    await store.init()
    await store.connect()

    expect(store.balanceNim).toBeNull()
    expect(store.balanceError).toBe('balance request failed: 503')
  })

  it('sends a tip transaction and records the tx hash', async () => {
    const sendBasicTransactionWithData = vi.fn().mockResolvedValue('tx-hash-123')
    vi.spyOn(nimiq, 'initNimiq').mockResolvedValue({
      listAccounts: vi.fn().mockResolvedValue([ADDRESS]),
      sendBasicTransactionWithData,
    } as any)
    vi.spyOn(api, 'fetchBalance').mockResolvedValue({ address: ADDRESS, balance_nim: 123.45 })

    const store = useWalletStore()
    await store.init()
    await store.connect()
    await store.sendTip()

    expect(sendBasicTransactionWithData).toHaveBeenCalledWith({
      recipient: import.meta.env.VITE_TIP_ADDRESS,
      value: TIP_AMOUNT_LUNA,
      data: 'NimLens tip',
    })
    expect(store.tipTxHash).toBe('tx-hash-123')
    expect(store.tipError).toBeNull()
  })

  it('records tipError when the tip transaction fails', async () => {
    const sendBasicTransactionWithData = vi.fn().mockRejectedValue(new Error('User rejected'))
    vi.spyOn(nimiq, 'initNimiq').mockResolvedValue({
      listAccounts: vi.fn().mockResolvedValue([ADDRESS]),
      sendBasicTransactionWithData,
    } as any)
    vi.spyOn(api, 'fetchBalance').mockResolvedValue({ address: ADDRESS, balance_nim: 123.45 })

    const store = useWalletStore()
    await store.init()
    await store.connect()
    await store.sendTip()

    expect(store.tipTxHash).toBeNull()
    expect(store.tipError).toBe('User rejected')
  })
})
