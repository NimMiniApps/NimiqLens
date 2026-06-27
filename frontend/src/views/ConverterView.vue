<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRatesStore } from '../stores/rates'
import { useWalletStore } from '../stores/wallet'
import { useScanStore } from '../stores/scan'
import { usePreferencesStore } from '../stores/preferences'
import { ASSETS, FIAT_CURRENCIES, computeAssetAmount, formatAssetAmount, formatNimAmount, type Asset, type FiatCurrency } from '../lib/convert'
import { affordability } from '../lib/affordability'
import AssetIcon from '../components/icons/AssetIcon.vue'
import IconAlert from '../components/icons/IconAlert.vue'
import IconCheck from '../components/icons/IconCheck.vue'

const ratesStore = useRatesStore()
const walletStore = useWalletStore()
const scanStore = useScanStore()
const preferencesStore = usePreferencesStore()

const price = ref<number | null>(null)
const currency = ref<FiatCurrency>(preferencesStore.fiatCurrency)

onMounted(() => {
  if (!ratesStore.rates) ratesStore.load()

  if (scanStore.pendingPrice !== null && scanStore.pendingCurrency !== null) {
    price.value = scanStore.pendingPrice
    currency.value = scanStore.pendingCurrency
    scanStore.clearPending()
  }
})

const conversions = computed((): Record<Asset, string> | null => {
  const rates = ratesStore.rates
  if (!rates || price.value === null || price.value <= 0) return null

  const result = {} as Record<Asset, string>
  for (const asset of ASSETS) {
    const rate = rates.rates[asset][currency.value]
    result[asset] = formatAssetAmount(asset, computeAssetAmount(price.value, rate))
  }
  return result
})

const nimAmountNeeded = computed((): number | null => {
  const rates = ratesStore.rates
  if (!rates || price.value === null || price.value <= 0) return null
  return computeAssetAmount(price.value, rates.rates.NIM[currency.value])
})

const affordabilityResult = computed(() => {
  if (nimAmountNeeded.value === null) return null
  return affordability(walletStore.balanceNim, nimAmountNeeded.value)
})

function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m`
}
</script>

<template>
  <div class="min-h-screen p-4 pb-28">
    <h1 class="text-2xl font-bold mb-4">Price Lens</h1>

    <div
      v-if="ratesStore.isStale"
      class="mb-4 flex items-center gap-2 rounded-lg border border-nimiq-gold/30 bg-nimiq-gold/10 px-3 py-2 text-sm text-nimiq-gold-light"
    >
      <IconAlert class="h-4 w-4 shrink-0" />
      Rates from {{ ratesStore.rates ? relativeTime(ratesStore.rates.fetched_at) : 'an unknown time' }} ago — may be outdated
    </div>
    <div
      v-else-if="ratesStore.error && !ratesStore.rates"
      class="mb-4 flex items-center gap-2 rounded-lg border border-nimiq-red/30 bg-nimiq-red/10 px-3 py-2 text-sm text-nimiq-red-light"
    >
      <IconAlert class="h-4 w-4 shrink-0" />
      Rates unavailable — try again later
    </div>

    <div class="flex gap-2 mb-4">
      <input
        v-model.number="price"
        type="number"
        inputmode="decimal"
        min="0"
        step="0.01"
        placeholder="0.00"
        class="min-w-0 flex-1 min-h-[44px] rounded-lg bg-nimiq-card border border-nimiq-border px-3 text-xl focus:outline-2 focus:outline-nimiq-blue-light"
      />
      <select
        v-model="currency"
        class="w-24 shrink-0 min-h-[44px] rounded-lg bg-nimiq-card border border-nimiq-border px-3 text-xl cursor-pointer focus:outline-2 focus:outline-nimiq-blue-light"
      >
        <option v-for="c in FIAT_CURRENCIES" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>

    <p v-if="ratesStore.loading && !ratesStore.rates" class="mb-4 text-nimiq-muted">
      Loading rates…
    </p>

    <div v-if="conversions" class="flex flex-col gap-2 mb-4">
      <div
        v-for="asset in ASSETS"
        :key="asset"
        class="rounded-xl border border-nimiq-border bg-nimiq-card p-4 flex items-center gap-3"
      >
        <AssetIcon :asset="asset" class="h-8 w-8 shrink-0" />
        <div class="text-sm text-nimiq-muted w-12 shrink-0">{{ asset }}</div>
        <div class="flex-1 text-right text-xl font-semibold tabular-nums">{{ conversions[asset] }}</div>
      </div>
    </div>

    <div v-if="affordabilityResult" class="rounded-xl border border-nimiq-border bg-nimiq-card p-4">
      <div v-if="affordabilityResult.affordable" class="flex items-center gap-2 font-medium text-nimiq-green-light">
        <IconCheck class="h-4 w-4 shrink-0" />
        You can afford this with your NIM balance
      </div>
      <div v-else class="flex items-center gap-2 font-medium text-nimiq-gold-light">
        <IconAlert class="h-4 w-4 shrink-0" />
        You need ≈ {{ formatNimAmount(affordabilityResult.deficit) }} more NIM
      </div>
      <p v-if="nimAmountNeeded !== null" class="mt-2 text-sm text-nimiq-muted">
        Price requires ≈ {{ formatNimAmount(nimAmountNeeded) }} NIM
      </p>
      <p v-if="walletStore.balanceNim !== null" class="mt-1 text-sm text-nimiq-muted">
        You have {{ formatNimAmount(walletStore.balanceNim) }} NIM
      </p>
    </div>
    <div
      v-else-if="walletStore.address && walletStore.balanceError"
      class="rounded-xl border border-nimiq-border bg-nimiq-card p-4 text-nimiq-muted"
    >
      Balance unavailable
    </div>
  </div>
</template>
