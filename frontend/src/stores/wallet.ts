import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { initNimiq, providerResult, type NimiqProvider } from '../lib/nimiq'
import { fetchBalanceFromProvider } from '../lib/balance'
import { fetchBalance } from '../lib/api'
import { shortenAddress } from '../lib/address'
import {
  isCachedWalletFresh,
  readCachedWalletSnapshot,
  writeCachedWalletAddress,
  writeCachedWalletSnapshot,
} from '../lib/walletSession'

/** 1000 NIM, in Luna (1 NIM = 100,000 Luna). */
export const TIP_AMOUNT_LUNA = 100_000_000
const ACCOUNT_REQUEST_TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error('Nimiq Pay did not respond. Try again.')), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout))
}

function scheduleIdle(task: () => Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      void task().finally(() => resolve())
    }, 0)
  })
}

function createInitialWalletState() {
  const cachedWallet = readCachedWalletSnapshot()
  if (!cachedWallet) {
    return {
      provider: null as NimiqProvider | null,
      isInsideNimiqPay: false,
      initialized: false,
      connecting: false,
      connectionError: null as string | null,
      address: null as string | null,
      sessionRestored: false,
      balanceLoading: false,
      balanceNim: null as number | null,
      balanceError: null as string | null,
      tipTxHash: null as string | null,
      tipError: null as string | null,
    }
  }

  return {
    provider: null as NimiqProvider | null,
    isInsideNimiqPay: true,
    initialized: true,
    connecting: false,
    connectionError: null as string | null,
    address: cachedWallet.address,
    sessionRestored: true,
    balanceLoading: false,
    balanceNim: cachedWallet.balanceNim,
    balanceError: null as string | null,
    tipTxHash: null as string | null,
    tipError: null as string | null,
  }
}

async function selectAccountForBalance(
  provider: Pick<NimiqProvider, 'getRPC'>,
  accounts: string[],
): Promise<{ address: string | null; balanceNim: number | null }> {
  const firstAccount = accounts[0] ?? null
  if (!firstAccount || !provider.getRPC?.()) return { address: firstAccount, balanceNim: null }

  let selectedAddress = firstAccount
  let selectedBalance: number | null = null

  for (const account of accounts) {
    try {
      const balance = await fetchBalanceFromProvider(provider, account)
      if (selectedBalance === null || balance.balance_nim > selectedBalance) {
        selectedAddress = account
        selectedBalance = balance.balance_nim
      }
    } catch {
      // Keep connect usable even if one listed account cannot be read.
    }
  }

  return { address: selectedAddress, balanceNim: selectedBalance }
}

let attachPromise: Promise<void> | null = null

export const useWalletStore = defineStore('wallet', {
  state: () => createInitialWalletState(),
  getters: {
    shortAddress: (state): string | null => (state.address ? shortenAddress(state.address) : null),
  },
  actions: {
    init() {
      const cachedWallet = readCachedWalletSnapshot()
      if (cachedWallet && isCachedWalletFresh(cachedWallet)) {
        return Promise.resolve()
      }
      return scheduleIdle(() => this.attachProvider())
    },
    async ensureProvider() {
      if (this.provider) return
      if (!attachPromise) {
        attachPromise = this.attachProvider().finally(() => {
          attachPromise = null
        })
      }
      await attachPromise
    },
    async attachProvider() {
      const provider = await initNimiq()
      this.provider = provider ? markRaw(provider) : null
      this.isInsideNimiqPay = this.provider !== null
      this.initialized = true

      if (!this.isInsideNimiqPay || !this.address || !this.provider?.getRPC?.()) return

      const cachedWallet = readCachedWalletSnapshot()
      if (cachedWallet && isCachedWalletFresh(cachedWallet)) return

      await this.loadBalance()
    },
    async connect() {
      await this.ensureProvider()
      if (!this.provider || this.connecting) return
      this.connecting = true
      this.connectionError = null
      this.sessionRestored = false
      try {
        const accounts = providerResult(
          await withTimeout(this.provider.listAccounts(), ACCOUNT_REQUEST_TIMEOUT_MS),
        )
        const selected = await selectAccountForBalance(this.provider, accounts)
        this.address = selected.address
        if (this.address) {
          writeCachedWalletAddress(this.address)
          if (selected.balanceNim !== null) {
            this.balanceNim = selected.balanceNim
            this.balanceError = null
            writeCachedWalletSnapshot({ address: this.address, balanceNim: selected.balanceNim })
          } else {
            await this.loadBalance()
          }
        } else {
          writeCachedWalletAddress(null)
        }
      } catch (e) {
        this.connectionError = e instanceof Error ? e.message : String(e)
        if (!this.address) writeCachedWalletAddress(null)
      } finally {
        this.connecting = false
      }
    },
    disconnect() {
      this.address = null
      this.balanceNim = null
      this.balanceError = null
      this.connectionError = null
      this.sessionRestored = false
      writeCachedWalletAddress(null)
    },
    async loadBalance() {
      if (!this.address) return
      await this.ensureProvider()
      this.balanceLoading = true
      this.balanceError = null
      try {
        const provider = this.provider
        const rpc = provider?.getRPC?.()
        const resp = rpc && provider
          ? await fetchBalanceFromProvider(provider, this.address)
          : await fetchBalance(this.address)
        this.balanceNim = resp.balance_nim
        writeCachedWalletSnapshot({ address: this.address, balanceNim: resp.balance_nim })
      } catch (e) {
        this.balanceError = e instanceof Error ? e.message : String(e)
      } finally {
        this.balanceLoading = false
      }
    },
    async sendTip() {
      await this.ensureProvider()
      if (!this.provider || !this.address) return
      this.tipError = null
      this.tipTxHash = null
      try {
        const result = await this.provider.sendBasicTransactionWithData({
          recipient: import.meta.env.VITE_TIP_ADDRESS,
          value: TIP_AMOUNT_LUNA,
          data: 'NimLens tip',
        })
        if (typeof result === 'string') {
          this.tipTxHash = result
        } else {
          this.tipError = result.error.message
        }
      } catch (e) {
        this.tipError = e instanceof Error ? e.message : String(e)
      }
    },
  },
})
