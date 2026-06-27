<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWalletStore } from '../stores/wallet'
import { usePreferencesStore } from '../stores/preferences'
import { FIAT_CURRENCIES, type FiatCurrency } from '../lib/convert'
import IconHexagon from '../components/icons/IconHexagon.vue'
import IconWallet from '../components/icons/IconWallet.vue'
import IconCheck from '../components/icons/IconCheck.vue'
import IconAlert from '../components/icons/IconAlert.vue'
import IconSpinner from '../components/icons/IconSpinner.vue'
import IconArrowLeft from '../components/icons/IconArrowLeft.vue'

const router = useRouter()
const walletStore = useWalletStore()
const preferencesStore = usePreferencesStore()

const step = ref<1 | 2>(1)
const selectedCurrency = ref<FiatCurrency>(preferencesStore.fiatCurrency)

const walletConnected = computed(() => !!walletStore.address)

onMounted(() => {
  void walletStore.init()
})

function goToCurrencyStep() {
  if (walletStore.connecting) walletStore.cancelConnect()
  step.value = 2
}

function goBack() {
  step.value = 1
}

function finish() {
  if (walletStore.connecting) walletStore.cancelConnect()
  preferencesStore.completeOnboarding(selectedCurrency.value)
  router.replace('/')
}
</script>

<template>
  <div class="min-h-screen p-4 flex flex-col gap-6">
    <div class="flex items-center gap-3">
      <IconHexagon class="h-9 w-9" />
      <div>
        <h1 class="text-2xl font-bold leading-tight">Welcome to NimLens</h1>
        <p class="text-sm text-nimiq-muted">A couple of quick things to set up.</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <div class="h-1.5 flex-1 rounded-full" :class="step >= 1 ? 'bg-nimiq-blue-light' : 'bg-nimiq-border'"></div>
      <div class="h-1.5 flex-1 rounded-full" :class="step >= 2 ? 'bg-nimiq-blue-light' : 'bg-nimiq-border'"></div>
    </div>

    <section v-if="step === 1" class="flex flex-col gap-4">
      <div class="rounded-2xl border border-nimiq-border bg-nimiq-card p-4 flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <IconWallet class="h-5 w-5 text-nimiq-blue-light" />
          <h2 class="text-lg font-semibold">Connect your wallet</h2>
        </div>

        <p v-if="!walletStore.initialized" class="flex items-center gap-2 text-sm text-nimiq-muted">
          <IconSpinner class="h-4 w-4 shrink-0 text-nimiq-blue-light" />
          Starting Nimiq Pay…
        </p>

        <template v-else-if="walletStore.isInsideNimiqPay">
          <p v-if="walletConnected" class="flex items-center gap-2 text-sm text-nimiq-green-light">
            <IconCheck class="h-4 w-4 shrink-0" />
            Wallet connected — {{ walletStore.shortAddress }}
          </p>
          <template v-else>
            <p class="text-sm text-nimiq-muted">
              Connect your Nimiq wallet to see your balance and check whether you can afford a
              scanned price.
            </p>
            <p v-if="walletStore.connectionError" class="flex items-center gap-2 text-sm text-nimiq-red-light">
              <IconAlert class="h-4 w-4 shrink-0" />
              {{ walletStore.connectionError }}
            </p>
            <div class="flex gap-2">
              <button
                v-if="walletStore.connecting"
                type="button"
                class="min-h-[44px] rounded-lg bg-nimiq-card border border-nimiq-border px-4 font-medium transition-colors duration-200 hover:bg-nimiq-card-elevated cursor-pointer"
                @click="walletStore.cancelConnect()"
              >
                Cancel
              </button>
              <button
                type="button"
                class="min-h-[44px] flex-1 rounded-lg bg-nimiq-blue-light px-4 font-medium text-nimiq-darkerblue transition-colors duration-200 hover:brightness-110 disabled:opacity-50 cursor-pointer"
                :disabled="walletStore.connecting"
                @click="walletStore.connect()"
              >
                {{ walletStore.connecting ? 'Connecting…' : 'Connect wallet' }}
              </button>
            </div>
          </template>
        </template>

        <p v-else class="text-sm text-nimiq-muted">
          Open NimLens inside Nimiq Pay to connect your wallet and see your balance. You can
          still use price scanning and conversion without it.
        </p>
      </div>

      <button
        type="button"
        class="min-h-[44px] rounded-lg bg-nimiq-card border border-nimiq-border px-4 font-medium transition-colors duration-200 hover:bg-nimiq-card-elevated cursor-pointer"
        @click="goToCurrencyStep"
      >
        {{ walletConnected ? 'Continue' : 'Skip for now' }}
      </button>
    </section>

    <section v-else class="flex flex-col gap-4">
      <div class="rounded-2xl border border-nimiq-border bg-nimiq-card p-4 flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Default currency</h2>
        <p class="text-sm text-nimiq-muted">
          Choose the currency you usually see prices in. You can change this later in About.
        </p>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="c in FIAT_CURRENCIES"
            :key="c"
            type="button"
            class="min-h-[44px] rounded-lg border px-4 font-medium transition-colors duration-200 cursor-pointer"
            :class="
              selectedCurrency === c
                ? 'border-nimiq-blue-light bg-nimiq-blue-light/10 text-nimiq-blue-light'
                : 'border-nimiq-border bg-nimiq-card-elevated hover:bg-white/10'
            "
            @click="selectedCurrency = c"
          >
            {{ c }}
          </button>
        </div>
      </div>

      <div class="flex gap-2">
        <button
          type="button"
          class="min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-nimiq-card border border-nimiq-border px-4 font-medium transition-colors duration-200 hover:bg-nimiq-card-elevated cursor-pointer"
          @click="goBack"
        >
          <IconArrowLeft class="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          class="min-h-[44px] flex-1 rounded-lg bg-nimiq-green-light px-4 font-semibold text-nimiq-darkerblue transition-colors duration-200 hover:brightness-110 cursor-pointer"
          @click="finish"
        >
          Get started
        </button>
      </div>
    </section>
  </div>
</template>
