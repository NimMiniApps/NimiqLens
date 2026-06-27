<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useWalletStore, DEFAULT_TIP_AMOUNT_NIM } from '../stores/wallet'
import { usePreferencesStore } from '../stores/preferences'
import { FIAT_CURRENCIES, type FiatCurrency } from '../lib/convert'
import { fetchBackendVersion, resolveApiBase, type BackendVersionResponse } from '../lib/api'
import { purgeLocalAppData } from '../lib/appData'
import { getFrontendVersion } from '../lib/version'
import IconHexagon from '../components/icons/IconHexagon.vue'
import IconGift from '../components/icons/IconGift.vue'
import IconCheck from '../components/icons/IconCheck.vue'
import IconAlert from '../components/icons/IconAlert.vue'
import IconTrash from '../components/icons/IconTrash.vue'

const walletStore = useWalletStore()
const preferencesStore = usePreferencesStore()
const frontendVersion = getFrontendVersion()
const backendVersion = ref<BackendVersionResponse | null>(null)
const backendVersionError = ref<string | null>(null)
const purging = ref(false)
const tipAmountNim = ref(DEFAULT_TIP_AMOUNT_NIM)

const TIP_PRESETS_NIM = [100, 500, 1000] as const

const fiatCurrency = computed<FiatCurrency>({
  get: () => preferencesStore.fiatCurrency,
  set: (value) => preferencesStore.setFiatCurrency(value),
})

const apiBase = computed(() => resolveApiBase() || window.location.origin)

function shortCommit(commit: string): string {
  return commit.slice(0, 8)
}

async function loadBackendVersion() {
  backendVersionError.value = null
  try {
    backendVersion.value = await fetchBackendVersion()
  } catch (e) {
    backendVersion.value = null
    backendVersionError.value = e instanceof Error ? e.message : String(e)
  }
}

async function purgeAppData() {
  purging.value = true
  walletStore.cancelConnect()
  walletStore.disconnect()
  await purgeLocalAppData()
}

onMounted(() => {
  void loadBackendVersion()
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
    <p class="text-nimiq-muted">
      Nimiq Pay still controls which wallet account is active. Purging NimLens data clears this
      mini app's local WebView state, but it does not switch accounts inside Nimiq Pay.
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
        If NimLens is useful to you, you can send a one-time tip to support development.
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="preset in TIP_PRESETS_NIM"
          :key="preset"
          type="button"
          class="min-h-[44px] rounded-lg border px-3 text-sm transition-colors duration-200 cursor-pointer"
          :class="tipAmountNim === preset
            ? 'border-nimiq-gold-light bg-nimiq-gold/15 text-nimiq-gold-light'
            : 'border-nimiq-border bg-nimiq-card text-nimiq-muted hover:bg-nimiq-card-elevated'"
          @click="tipAmountNim = preset"
        >
          {{ preset }} NIM
        </button>
      </div>
      <label class="flex items-center justify-between gap-3 rounded-lg bg-nimiq-card border border-nimiq-border p-3">
        <span class="text-sm text-nimiq-muted">Custom amount</span>
        <div class="flex items-center gap-2">
          <input
            v-model.number="tipAmountNim"
            type="number"
            inputmode="decimal"
            min="0.01"
            step="0.01"
            class="w-28 min-h-[44px] rounded-lg bg-nimiq-card-elevated px-3 text-right text-lg focus:outline-2 focus:outline-nimiq-blue-light"
          />
          <span class="text-sm text-nimiq-muted">NIM</span>
        </div>
      </label>
      <button
        type="button"
        data-testid="send-tip-button"
        class="min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-nimiq-gold-light px-4 font-medium text-nimiq-darkerblue transition-colors duration-200 hover:brightness-110 disabled:opacity-60 cursor-pointer"
        :disabled="walletStore.tipSending || !tipAmountNim || tipAmountNim <= 0"
        @click="walletStore.sendTip(tipAmountNim)"
      >
        <IconGift class="h-5 w-5" />
        {{ walletStore.tipSending ? 'Sending tip...' : `Tip ${tipAmountNim} NIM` }}
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
        This clears the wallet address shown by NimLens. If the wrong account appears again,
        change the selected account in Nimiq Pay and reconnect from the Home screen.
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

    <h2 class="text-lg font-semibold text-nimiq-blue-light">Version</h2>
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-lg border border-nimiq-border bg-nimiq-card p-3 text-sm">
      <dt class="text-nimiq-muted">Frontend</dt>
      <dd class="font-mono">{{ shortCommit(frontendVersion.commitHash) }}</dd>

      <dt class="text-nimiq-muted">Build date</dt>
      <dd class="break-all">{{ frontendVersion.buildTime }}</dd>

      <dt class="text-nimiq-muted">API</dt>
      <dd class="break-all">{{ apiBase }}</dd>

      <template v-if="backendVersion">
        <dt class="text-nimiq-muted">Backend</dt>
        <dd class="font-mono">{{ shortCommit(backendVersion.commit_hash) }}</dd>

        <dt class="text-nimiq-muted">Backend built</dt>
        <dd class="break-all">{{ backendVersion.build_time }}</dd>
      </template>
      <template v-else>
        <dt class="text-nimiq-muted">Backend</dt>
        <dd class="text-nimiq-red-light">{{ backendVersionError ?? 'Checking...' }}</dd>
      </template>
    </dl>

    <p class="text-sm text-nimiq-muted">
      Purging clears cached wallet access, browser caches, and offline data, then reloads NimLens.
      Your currency preference and onboarding progress are kept.
    </p>

    <button
      type="button"
      class="min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-nimiq-card border border-nimiq-border px-4 font-medium text-nimiq-red-light transition-colors duration-200 hover:bg-nimiq-red/10 disabled:opacity-60 cursor-pointer"
      :disabled="purging"
      @click="purgeAppData"
    >
      <IconTrash class="h-4 w-4" />
      {{ purging ? 'Purging...' : 'Purge local app data' }}
    </button>
  </div>
</template>
