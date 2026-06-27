import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { mount } from '@vue/test-utils'
import WelcomeView from './WelcomeView.vue'
import { useWalletStore } from '../stores/wallet'
import { useRatesStore } from '../stores/rates'
import type { RatesResponse } from '../lib/api'

const ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'
const RATES: RatesResponse = {
  rates: {
    NIM: { EUR: 0.01, USD: 0.011, GBP: 0.009, CHF: 0.0095, JPY: 1.6, CNY: 0.078, AUD: 0.0165, CAD: 0.0148, INR: 0.9, BRL: 0.054 },
    USDT: { EUR: 0.92, USD: 1, GBP: 0.79, CHF: 0.88, JPY: 147, CNY: 7.18, AUD: 1.52, CAD: 1.36, INR: 83, BRL: 4.97 },
    BTC: { EUR: 55000, USD: 64000, GBP: 48000, CHF: 51000, JPY: 8800000, CNY: 429000, AUD: 90800, CAD: 81400, INR: 4950000, BRL: 297000 },
    ETH: { EUR: 1400, USD: 1600, GBP: 1200, CHF: 1300, JPY: 224000, CNY: 10900, AUD: 2310, CAD: 2070, INR: 126000, BRL: 7560 },
  },
  timestamp: '2026-06-14T00:00:00Z',
  fetched_at: '2026-06-14T00:00:00Z',
  stale: false,
  source: 'CoinGecko',
}

let pinia: Pinia

function mountView() {
  return mount(WelcomeView, {
    global: {
      plugins: [pinia],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
}

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})

describe('WelcomeView', () => {
  it('offers to show the wallet balance after the provider initializes', () => {
    const walletStore = useWalletStore()
    walletStore.$patch({ isInsideNimiqPay: true, initialized: true })
    walletStore.connect = vi.fn()

    const wrapper = mountView()

    expect(wrapper.text()).toContain('Show wallet balance')
  })

  it('shows that the wallet is connecting after the user requests access', () => {
    const walletStore = useWalletStore()
    walletStore.$patch({ isInsideNimiqPay: true, connecting: true, accessRequested: true, initialized: true })

    const wrapper = mountView()

    expect(wrapper.text()).toContain('Connecting to your wallet')
  })

  it('does not show a connecting banner for stale in-flight requests', () => {
    const walletStore = useWalletStore()
    walletStore.$patch({ isInsideNimiqPay: true, connecting: true, accessRequested: false, initialized: true })

    const wrapper = mountView()

    expect(wrapper.text()).not.toContain('Connecting to your wallet')
    expect(wrapper.text()).toContain('Show wallet balance')
  })

  it('shows provider startup before wallet access is requested', () => {
    const walletStore = useWalletStore()
    walletStore.$patch({ isInsideNimiqPay: true, initialized: false })

    const wrapper = mountView()

    expect(wrapper.text()).toContain('Starting Nimiq Pay')
  })

  it('shows the NIM balance converted to the preferred fiat currency', () => {
    const walletStore = useWalletStore()
    walletStore.$patch({ initialized: true, address: ADDRESS, balanceNim: 100 })
    const ratesStore = useRatesStore()
    ratesStore.$patch({ rates: RATES })

    const wrapper = mountView()

    expect(wrapper.text()).toContain('100.00 NIM')
    expect(wrapper.text()).toContain('EUR 1.00')
  })

  it('keeps the cached balance visible while refreshing in the background', () => {
    const walletStore = useWalletStore()
    walletStore.$patch({
      initialized: true,
      address: ADDRESS,
      balanceNim: 100,
      balanceLoading: true,
      sessionRestored: true,
    })
    const ratesStore = useRatesStore()
    ratesStore.$patch({ rates: RATES })

    const wrapper = mountView()

    expect(wrapper.text()).toContain('100.00 NIM')
    expect(wrapper.text()).toContain('Updating balance')
    expect(wrapper.text()).not.toContain('Balance unavailable')
    expect(wrapper.text()).toContain('EUR 1.00')
  })

  it('does not show balance unavailable when a cached balance is on screen', () => {
    const walletStore = useWalletStore()
    walletStore.$patch({
      initialized: true,
      address: ADDRESS,
      balanceNim: 100,
      sessionRestored: true,
    })
    const ratesStore = useRatesStore()
    ratesStore.$patch({ rates: RATES })

    const wrapper = mountView()

    expect(wrapper.text()).toContain('100.00 NIM')
    expect(wrapper.text()).not.toContain('Balance unavailable')
  })

  it('retries wallet connection after an account-access failure', async () => {
    const walletStore = useWalletStore()
    walletStore.$patch({
      isInsideNimiqPay: true,
      initialized: true,
      connectionError: 'User rejected',
    })
    walletStore.connect = vi.fn()

    const wrapper = mountView()
    await wrapper.get('button').trigger('click')

    expect(wrapper.text()).toContain('User rejected')
    expect(walletStore.connect).toHaveBeenCalledOnce()
  })

  it('shows camera scan as a primary action', () => {
    const walletStore = useWalletStore()
    walletStore.$patch({ initialized: true })

    const wrapper = mountView()

    expect(wrapper.text()).toContain('Start camera scan')
    expect(wrapper.text()).toContain('Point your camera at a price tag, receipt, or menu.')
  })
})
