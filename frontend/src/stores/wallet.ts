import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { initNimiq, providerResult, type NimiqProvider } from '../lib/nimiq'
import { fetchBalanceFromProvider } from '../lib/balance'
import { fetchBalance } from '../lib/api'
import { shortenAddress } from '../lib/address'
import {
  isLikelyNimiqAddress,
  readCachedWalletAddress,
  writeCachedWalletAddress,
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

export const useWalletStore = defineStore('wallet', {
  state: () => ({
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
  }),
  getters: {
    shortAddress: (state): string | null => (state.address ? shortenAddress(state.address) : null),
  },
  actions: {
    async init() {
      const provider = await initNimiq()
      this.provider = provider ? markRaw(provider) : null
      this.isInsideNimiqPay = this.provider !== null
      this.initialized = true
      if (this.isInsideNimiqPay) {
        void this.restoreSession()
      }
    },
    async restoreSession() {
      if (!this.provider) return
      const cached = readCachedWalletAddress()
      if (!cached || !isLikelyNimiqAddress(cached)) return

      this.sessionRestored = true
      this.connectionError = null
      this.address = cached
      await this.loadBalance()
    },
    async connect() {
      if (!this.provider || this.connecting) return
      this.connecting = true
      this.connectionError = null
      this.sessionRestored = false
      try {
        const accounts = providerResult(
          await withTimeout(this.provider.listAccounts(), ACCOUNT_REQUEST_TIMEOUT_MS),
        )
        this.address = accounts[0] ?? null
        if (this.address) {
          writeCachedWalletAddress(this.address)
          await this.loadBalance()
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
      this.balanceLoading = true
      this.balanceError = null
      try {
        const provider = this.provider
        const rpc = provider?.getRPC?.()
        const resp = rpc && provider
          ? await fetchBalanceFromProvider(provider, this.address)
          : await fetchBalance(this.address)
        this.balanceNim = resp.balance_nim
      } catch (e) {
        this.balanceError = e instanceof Error ? e.message : String(e)
        this.balanceNim = null
      } finally {
        this.balanceLoading = false
      }
    },
    async sendTip() {
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
