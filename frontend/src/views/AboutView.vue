<script setup lang="ts">
import { computed } from 'vue'
import { useWalletStore } from '../stores/wallet'
import { usePreferencesStore } from '../stores/preferences'
import { FIAT_CURRENCIES, type FiatCurrency } from '../lib/convert'
import IconHexagon from '../components/icons/IconHexagon.vue'
import IconGift from '../components/icons/IconGift.vue'
import IconCheck from '../components/icons/IconCheck.vue'
import IconAlert from '../components/icons/IconAlert.vue'
import IconTrash from '../components/icons/IconTrash.vue'

const walletStore = useWalletStore()
const preferencesStore = usePreferencesStore()

const fiatCurrency = computed<FiatCurrency>({
  get: () => preferencesStore.fiatCurrency,
  set: (value) => preferencesStore.setFiatCurrency(value),
})
</script>

<template>
  <div class="min-h-screen p-4 pb-28 flex flex-col gap-4">
    <div class="flex items-center gap-3">
      <IconHexagon class="h-9 w-9" />
      <h1 class="text-2xl font-bold">About NimLens</h1>
    </div>
    <p class="text-nimiq-muted">
      NimLens converts real-world fiat prices into NIM, USDT, BTC, and ETH so you can quickly
      see what something is worth in crypto.
    </p>

    <h2 class="text-lg font-semibold text-nimiq-blue-light">Preferences</h2>
    <label class="flex items-center justify-between gap-3 rounded-lg bg-nimiq-card border border-nimiq-border p-3">
      <span class="text-sm text-nimiq-muted">Default currency</span>
      <select
        v-model="fiatCurrency"
        class="min-h-[44px] rounded-lg bg-nimiq-card-elevated px-3 text-lg cursor-pointer focus:outline-2 focus:outline-nimiq-blue-light"
      >
        <option v-for="c in FIAT_CURRENCIES" :key="c" :value="c">{{ c }}</option>
      </select>
    </label>

    <h2 class="text-lg font-semibold text-nimiq-blue-light">Nimiq Pay integration</h2>
    <p class="text-nimiq-muted">
      When you ask to see your wallet balance, NimLens requests account access and then shows
      your NIM balance and approximate fiat values. Account access and every NIM transaction
      require your approval through Nimiq Pay's native dialogs. NimLens never accesses your
      private keys or seed phrase.
    </p>

    <h2 class="text-lg font-semibold text-nimiq-blue-light">Privacy</h2>
    <p class="text-nimiq-muted">
      Camera scanning (when available) runs entirely on your device — no images are uploaded
      or stored. NimLens does not track you and stores no personal data.
    </p>

    <h2 class="text-lg font-semibold text-nimiq-blue-light">Open source</h2>
    <p class="text-nimiq-muted">
      NimLens is open source under the MIT license. The source code is included in this
      project's repository.
    </p>

    <h2 class="text-lg font-semibold text-nimiq-blue-light">Credits</h2>
    <p class="text-nimiq-muted">
      Exchange rates are provided by
      <a href="https://www.coingecko.com" class="text-nimiq-green-light underline" target="_blank" rel="noopener">CoinGecko</a>.
      On-device price scanning uses
      <a href="https://tesseract.projectnaptha.com" class="text-nimiq-green-light underline" target="_blank" rel="noopener">Tesseract.js</a>.
    </p>

    <template v-if="walletStore.isInsideNimiqPay && walletStore.address">
      <h2 class="text-lg font-semibold text-nimiq-blue-light">Support NimLens</h2>
      <p class="text-nimiq-muted">
        If NimLens is useful to you, you can send a small one-time tip to support development.
      </p>
      <button
        type="button"
        class="min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-nimiq-gold-light px-4 font-medium text-nimiq-darkerblue transition-colors duration-200 hover:brightness-110 cursor-pointer"
        @click="walletStore.sendTip()"
      >
        <IconGift class="h-5 w-5" />
        Tip 1000 NIM
      </button>
      <div v-if="walletStore.tipTxHash" class="flex items-center gap-2 text-sm text-nimiq-green-light">
        <IconCheck class="h-4 w-4 shrink-0" />
        Thank you! Transaction: {{ walletStore.tipTxHash }}
      </div>
      <div v-if="walletStore.tipError" class="flex items-center gap-2 text-sm text-nimiq-red-light">
        <IconAlert class="h-4 w-4 shrink-0" />
        Tip failed: {{ walletStore.tipError }}
      </div>
    </template>

    <template v-if="walletStore.address">
      <h2 class="text-lg font-semibold text-nimiq-blue-light">Local data</h2>
      <p class="text-nimiq-muted">
        Your wallet address is saved on this device so NimLens can show your balance without
        asking for access again.
      </p>
      <button
        type="button"
        class="min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-nimiq-card border border-nimiq-border px-4 font-medium text-nimiq-red-light transition-colors duration-200 hover:bg-nimiq-red/10 cursor-pointer"
        @click="walletStore.disconnect()"
      >
        <IconTrash class="h-4 w-4" />
        Forget saved wallet
      </button>
    </template>
  </div>
</template>
