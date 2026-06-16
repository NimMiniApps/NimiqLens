import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ConverterView from './ConverterView.vue'
import { useRatesStore } from '../stores/rates'
import { useWalletStore } from '../stores/wallet'
import { useScanStore } from '../stores/scan'
import type { RatesResponse } from '../lib/api'

const sampleRates: RatesResponse = {
  rates: {
    NIM: { EUR: 0.01, USD: 0.011, GBP: 0.009, CHF: 0.0095, JPY: 1.6, CNY: 0.078, AUD: 0.0165, CAD: 0.0148, INR: 0.9, BRL: 0.054 },
    USDT: { EUR: 0.92, USD: 1.0, GBP: 0.79, CHF: 0.88, JPY: 147, CNY: 7.18, AUD: 1.52, CAD: 1.36, INR: 83, BRL: 4.97 },
    BTC: { EUR: 55000, USD: 64000, GBP: 48000, CHF: 51000, JPY: 8800000, CNY: 429000, AUD: 90800, CAD: 81400, INR: 4950000, BRL: 297000 },
    ETH: { EUR: 1400, USD: 1600, GBP: 1200, CHF: 1300, JPY: 224000, CNY: 10900, AUD: 2310, CAD: 2070, INR: 126000, BRL: 7560 },
  },
  timestamp: '2026-06-13T16:30:00Z',
  fetched_at: new Date().toISOString(),
  stale: false,
  source: 'CoinGecko',
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('ConverterView', () => {
  it('shows conversion cards for all four assets once a price is entered', async () => {
    const ratesStore = useRatesStore()
    ratesStore.$patch({ rates: sampleRates })

    const wrapper = mount(ConverterView)
    await wrapper.find('input[type="number"]').setValue(10)

    const text = wrapper.text()
    expect(text).toContain('NIM')
    expect(text).toContain('USDT')
    expect(text).toContain('BTC')
    expect(text).toContain('ETH')
    expect(text).toContain('≈')
  })

  it('shows the affordable message when the wallet balance covers the price', async () => {
    const ratesStore = useRatesStore()
    ratesStore.$patch({ rates: sampleRates })
    const walletStore = useWalletStore()
    walletStore.$patch({ address: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000', balanceNim: 10000 })

    const wrapper = mount(ConverterView)
    await wrapper.find('input[type="number"]').setValue(10)

    expect(wrapper.text()).toContain('You can afford this with your NIM balance')
  })

  it('shows the deficit message when the wallet balance is insufficient', async () => {
    const ratesStore = useRatesStore()
    ratesStore.$patch({ rates: sampleRates })
    const walletStore = useWalletStore()
    walletStore.$patch({ address: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000', balanceNim: 1 })

    const wrapper = mount(ConverterView)
    await wrapper.find('input[type="number"]').setValue(10)

    expect(wrapper.text()).toContain('You need')
    expect(wrapper.text()).toContain('more NIM')
  })

  it('shows the required balance when the wallet cannot afford the price', async () => {
    const ratesStore = useRatesStore()
    ratesStore.$patch({ rates: { ...sampleRates, rates: { ...sampleRates.rates, NIM: { ...sampleRates.rates.NIM, EUR: 0.0005 } } } })
    const walletStore = useWalletStore()
    walletStore.$patch({
      address: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
      balanceNim: 10000,
    })

    const wrapper = mount(ConverterView)
    await wrapper.find('input[type="number"]').setValue(10)

    expect(wrapper.text()).toContain('Price requires ≈ 20,000.00 NIM')
    expect(wrapper.text()).toContain('You have 10,000.00 NIM')
  })

  it('shows the stale-rate banner when rates are stale', () => {
    const ratesStore = useRatesStore()
    ratesStore.$patch({ rates: { ...sampleRates, stale: true } })

    const wrapper = mount(ConverterView)

    expect(wrapper.text()).toContain('may be outdated')
  })

  it('prefills the price and currency from a pending scan result', async () => {
    const ratesStore = useRatesStore()
    ratesStore.$patch({ rates: sampleRates })
    const scanStore = useScanStore()
    scanStore.setPending(24.5, 'USD')

    const wrapper = mount(ConverterView)
    await flushPromises()

    const input = wrapper.find('input[type="number"]').element as HTMLInputElement
    const select = wrapper.find('select').element as HTMLSelectElement
    expect(input.value).toBe('24.5')
    expect(select.value).toBe('USD')
    expect(scanStore.pendingPrice).toBeNull()
  })
})
