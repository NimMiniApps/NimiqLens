import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AboutView from './AboutView.vue'
import { useWalletStore } from '../stores/wallet'

const ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.unstubAllGlobals()
})

describe('AboutView', () => {
  it('hides the tip button when not connected to Nimiq Pay', () => {
    const wrapper = mount(AboutView)
    expect(wrapper.text()).not.toContain('Tip')
  })

  it('shows the tip button once a wallet is connected', () => {
    const walletStore = useWalletStore()
    walletStore.$patch({ isInsideNimiqPay: true, address: ADDRESS })

    const wrapper = mount(AboutView)
    expect(wrapper.text()).toContain('Tip')
  })

  it('sends a tip when the button is pressed', async () => {
    const walletStore = useWalletStore()
    walletStore.$patch({ isInsideNimiqPay: true, address: ADDRESS })
    walletStore.sendTip = vi.fn()

    const wrapper = mount(AboutView)
    await wrapper.find('button').trigger('click')

    expect(walletStore.sendTip).toHaveBeenCalled()
  })

  it('shows frontend and backend version diagnostics', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      service: 'nimlens-backend',
      commit_hash: 'backend123',
      build_time: '2026-06-20T00:00:00Z',
      started_at: '2026-06-20T00:01:00Z',
      uptime_seconds: 60,
    }), { status: 200 })))

    const wrapper = mount(AboutView)
    await vi.waitFor(() => expect(wrapper.text()).toContain('backend1'))

    expect(wrapper.text()).toContain('Frontend')
    expect(wrapper.text()).toContain('API')
  })

  it('offers a full local purge separate from wallet account selection', () => {
    const wrapper = mount(AboutView)

    expect(wrapper.text()).toContain('Purge local app data')
    expect(wrapper.text()).toContain('Nimiq Pay still controls which wallet account is active.')
  })
})
