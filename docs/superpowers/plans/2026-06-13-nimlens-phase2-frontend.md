# NimLens Phase 2 — Frontend Scaffold & Converter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the NimLens Vue 3 + TypeScript + Tailwind frontend, wire up `@nimiq/mini-app-sdk`, Pinia stores, and the Go backend API client, and ship working Welcome, Converter, and Rates screens.

**Architecture:** Vite + Vue 3 + TypeScript app under `frontend/`. Pure logic (conversion math/formatting, address shortening, affordability, backend API client) lives in small `src/lib/*.ts` modules with Vitest unit tests. Two Pinia stores (`ratesStore`, `walletStore`) hold shared state and call the lib modules. Five routed views consume the stores. Tailwind v4 (via `@tailwindcss/vite`) handles styling, mobile-first.

**Tech Stack:** Vite, Vue 3 (`<script setup>` + TypeScript), Tailwind CSS v4, Pinia, Vue Router 4, `@nimiq/mini-app-sdk`, Vitest + `@vue/test-utils` + jsdom.

---

## File Structure

```
frontend/
├── index.html
├── package.json
├── vite.config.ts
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── style.css
│   ├── vite-env.d.ts
│   ├── router/index.ts
│   ├── stores/
│   │   ├── rates.ts
│   │   ├── rates.test.ts
│   │   ├── wallet.ts
│   │   └── wallet.test.ts
│   ├── lib/
│   │   ├── convert.ts
│   │   ├── convert.test.ts
│   │   ├── address.ts
│   │   ├── affordability.ts
│   │   ├── format.test.ts
│   │   ├── api.ts
│   │   ├── api.test.ts
│   │   └── nimiq.ts
│   └── views/
│       ├── WelcomeView.vue
│       ├── ConverterView.vue
│       ├── ConverterView.test.ts
│       ├── ScanView.vue
│       ├── RatesView.vue
│       └── AboutView.vue
```

---

### Task 1: Scaffold Vite + Vue 3 + TS app with Tailwind

**Files:**
- Create: `frontend/` (via `npm create vite@latest`)
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/style.css`
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/main.ts`
- Modify: `frontend/index.html`
- Delete: `frontend/src/components/HelloWorld.vue`, `frontend/src/assets/vue.svg`, `frontend/public/vite.svg`

- [ ] **Step 1: Scaffold the project**

```bash
cd /home/maestro/Documents/projects/NimiqLens
npm create vite@latest frontend -- --template vue-ts
cd frontend
npm install
```

- [ ] **Step 2: Install Tailwind v4**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend
npm install tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Configure Vite (Tailwind plugin + LAN dev server)**

Replace `frontend/vite.config.ts` with:

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
})
```

- [ ] **Step 4: Replace the stylesheet with the Tailwind import**

Replace the entire contents of `frontend/src/style.css` with:

```css
@import "tailwindcss";
```

- [ ] **Step 5: Remove template cruft**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend
rm -f src/components/HelloWorld.vue src/assets/vue.svg public/vite.svg
rmdir src/components src/assets 2>/dev/null || true
```

- [ ] **Step 6: Replace App.vue with a minimal placeholder**

Replace `frontend/src/App.vue` with:

```vue
<script setup lang="ts">
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-white flex items-center justify-center">
    <p class="text-xl">NimLens</p>
  </div>
</template>
```

- [ ] **Step 7: Simplify main.ts**

Replace `frontend/src/main.ts` with:

```ts
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
```

- [ ] **Step 8: Set the page title**

In `frontend/index.html`, change `<title>Vite + Vue + TS</title>` to `<title>NimLens</title>`.

- [ ] **Step 9: Verify the build and dev server**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend
npm run build
```
Expected: build succeeds with no errors.

```bash
npm run dev -- --host &
sleep 2
curl -s http://localhost:5173/ | grep -i NimLens
kill %1
```
Expected: the curl output includes `<title>NimLens</title>`.

- [ ] **Step 10: Commit**

```bash
cd /home/maestro/Documents/projects/NimiqLens
git add frontend
git commit -m "Scaffold Vue 3 + Vite + Tailwind frontend"
```

---

### Task 2: Install Pinia, Router, SDK, and Vitest

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/package.json`
- Create: `frontend/src/lib/sanity.test.ts` (temporary, removed at end of task)

- [ ] **Step 1: Install runtime and dev dependencies**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend
npm install pinia vue-router@4 @nimiq/mini-app-sdk
npm install -D vitest @vue/test-utils jsdom
```

- [ ] **Step 2: Configure Vitest in vite.config.ts**

Replace `frontend/vite.config.ts` with:

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

- [ ] **Step 3: Add a test script to package.json**

In `frontend/package.json`, add a `"test"` entry to the `"scripts"` object:

```json
"test": "vitest run"
```

- [ ] **Step 4: Write a sanity test**

Create `frontend/src/lib/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run the test suite**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: PASS (1 test)

- [ ] **Step 6: Remove the sanity test**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend
rm src/lib/sanity.test.ts
```

- [ ] **Step 7: Commit**

```bash
cd /home/maestro/Documents/projects/NimiqLens
git add frontend
git commit -m "Add Pinia, Vue Router, Nimiq SDK, and Vitest"
```

---

### Task 3: Conversion math and formatting

**Files:**
- Create: `frontend/src/lib/convert.ts`
- Create: `frontend/src/lib/convert.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/convert.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeAssetAmount, formatAssetAmount } from './convert'

describe('computeAssetAmount', () => {
  it('divides fiat amount by the asset rate', () => {
    expect(computeAssetAmount(10, 0.5)).toBe(20)
    expect(computeAssetAmount(12.99, 1)).toBeCloseTo(12.99)
  })
})

describe('formatAssetAmount', () => {
  it('formats NIM with 4 decimals when amount is below 1', () => {
    expect(formatAssetAmount('NIM', 0.5)).toBe('≈ 0.5000')
  })

  it('formats NIM with 2 decimals when amount is 1 or above', () => {
    expect(formatAssetAmount('NIM', 12.3456)).toBe('≈ 12.35')
  })

  it('formats USDT with 2 decimals', () => {
    expect(formatAssetAmount('USDT', 12.345)).toBe('≈ 12.35')
  })

  it('formats BTC with 8 decimals', () => {
    expect(formatAssetAmount('BTC', 0.000123456789)).toBe('≈ 0.00012346')
  })

  it('formats ETH with 6 decimals', () => {
    expect(formatAssetAmount('ETH', 1.23456789)).toBe('≈ 1.234568')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: FAIL — `Failed to resolve import "./convert"`

- [ ] **Step 3: Implement the conversion module**

Create `frontend/src/lib/convert.ts`:

```ts
export type Asset = 'NIM' | 'USDT' | 'BTC' | 'ETH'
export type FiatCurrency = 'EUR' | 'USD' | 'GBP' | 'CHF'

export const ASSETS: Asset[] = ['NIM', 'USDT', 'BTC', 'ETH']
export const FIAT_CURRENCIES: FiatCurrency[] = ['EUR', 'USD', 'GBP', 'CHF']

/** assetAmount = fiatAmount / assetPriceInFiat */
export function computeAssetAmount(fiatAmount: number, rate: number): number {
  return fiatAmount / rate
}

/** Formats an asset amount with the decimal precision defined in the design spec. */
export function formatAssetAmount(asset: Asset, amount: number): string {
  let decimals: number
  switch (asset) {
    case 'NIM':
      decimals = amount < 1 ? 4 : 2
      break
    case 'USDT':
      decimals = 2
      break
    case 'BTC':
      decimals = 8
      break
    case 'ETH':
      decimals = 6
      break
    default: {
      const _exhaustive: never = asset
      throw new Error(`Unsupported asset: ${_exhaustive}`)
    }
  }
  return `≈ ${amount.toFixed(decimals)}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/maestro/Documents/projects/NimiqLens
git add frontend/src/lib/convert.ts frontend/src/lib/convert.test.ts
git commit -m "Add conversion math and formatting"
```

---

### Task 4: Address shortening and affordability helpers

**Files:**
- Create: `frontend/src/lib/address.ts`
- Create: `frontend/src/lib/affordability.ts`
- Create: `frontend/src/lib/format.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shortenAddress } from './address'
import { affordability } from './affordability'

describe('shortenAddress', () => {
  it('shortens a full NIM address to first and last group', () => {
    expect(shortenAddress('NQ07 0000 0000 0000 0000 0000 0000 0000 0000')).toBe('NQ07 **** **** 0000')
  })

  it('returns short input unchanged', () => {
    expect(shortenAddress('NQ07')).toBe('NQ07')
  })
})

describe('affordability', () => {
  it('returns null when balance is unknown', () => {
    expect(affordability(null, 10)).toBeNull()
  })

  it('reports affordable when balance covers the amount', () => {
    expect(affordability(100, 10)).toEqual({ affordable: true, deficit: 0 })
  })

  it('reports the deficit when balance is insufficient', () => {
    expect(affordability(5, 10)).toEqual({ affordable: false, deficit: 5 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: FAIL — `Failed to resolve import "./address"` and `"./affordability"`

- [ ] **Step 3: Implement shortenAddress**

Create `frontend/src/lib/address.ts`:

```ts
/** Shortens a space-separated NIM address to its first and last group, e.g. "NQ07 **** **** 6789". */
export function shortenAddress(address: string): string {
  const groups = address.trim().split(/\s+/)
  if (groups.length < 3) return address
  return `${groups[0]} **** **** ${groups[groups.length - 1]}`
}
```

- [ ] **Step 4: Implement affordability**

Create `frontend/src/lib/affordability.ts`:

```ts
export interface AffordabilityResult {
  affordable: boolean
  /** How many more NIM the user needs. 0 when affordable. */
  deficit: number
}

/** Compares a wallet's NIM balance against the NIM amount needed. Returns null if the balance is unknown. */
export function affordability(nimBalance: number | null, nimNeeded: number): AffordabilityResult | null {
  if (nimBalance === null) return null
  const affordable = nimBalance >= nimNeeded
  return { affordable, deficit: affordable ? 0 : nimNeeded - nimBalance }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /home/maestro/Documents/projects/NimiqLens
git add frontend/src/lib/address.ts frontend/src/lib/affordability.ts frontend/src/lib/format.test.ts
git commit -m "Add address shortening and affordability helpers"
```

---

### Task 5: Backend API client

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/api.test.ts`
- Modify: `frontend/src/vite-env.d.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/api.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchRates, fetchBalance } from './api'

const sampleRates = {
  rates: {
    NIM: { EUR: 0.01, USD: 0.011, GBP: 0.009, CHF: 0.0095 },
    USDT: { EUR: 0.92, USD: 1.0, GBP: 0.79, CHF: 0.88 },
    BTC: { EUR: 55000, USD: 64000, GBP: 48000, CHF: 51000 },
    ETH: { EUR: 1400, USD: 1600, GBP: 1200, CHF: 1300 },
  },
  timestamp: '2026-06-13T16:30:00Z',
  fetched_at: '2026-06-13T16:30:00Z',
  stale: false,
  source: 'CoinGecko',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchRates', () => {
  it('returns parsed rates on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sampleRates), { status: 200 })))

    const result = await fetchRates()
    expect(result.source).toBe('CoinGecko')
    expect(result.rates.NIM.EUR).toBe(0.01)
  })

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))

    await expect(fetchRates()).rejects.toThrow('rates request failed: 503')
  })
})

describe('fetchBalance', () => {
  it('returns parsed balance on success', async () => {
    const body = { address: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000', balance_nim: 123.45 }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))

    const result = await fetchBalance('NQ07 0000 0000 0000 0000 0000 0000 0000 0000')
    expect(result.balance_nim).toBe(123.45)
  })

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))

    await expect(fetchBalance('NQ07')).rejects.toThrow('balance request failed: 503')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: FAIL — `Failed to resolve import "./api"`

- [ ] **Step 3: Add the VITE_API_BASE_URL env type**

Append to `frontend/src/vite-env.d.ts` (keep the existing `/// <reference types="vite/client" />` line):

```ts
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 4: Implement the API client**

Create `frontend/src/lib/api.ts`:

```ts
import type { Asset, FiatCurrency } from './convert'

export type AssetRates = Record<FiatCurrency, number>

export interface RatesResponse {
  rates: Record<Asset, AssetRates>
  timestamp: string
  fetched_at: string
  stale: boolean
  source: string
}

export interface BalanceResponse {
  address: string
  balance_nim: number
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export async function fetchRates(): Promise<RatesResponse> {
  const res = await fetch(`${API_BASE}/api/rates`)
  if (!res.ok) throw new Error(`rates request failed: ${res.status}`)
  return res.json() as Promise<RatesResponse>
}

export async function fetchBalance(address: string): Promise<BalanceResponse> {
  const res = await fetch(`${API_BASE}/api/balance/${encodeURIComponent(address)}`)
  if (!res.ok) throw new Error(`balance request failed: ${res.status}`)
  return res.json() as Promise<BalanceResponse>
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /home/maestro/Documents/projects/NimiqLens
git add frontend/src/lib/api.ts frontend/src/lib/api.test.ts frontend/src/vite-env.d.ts
git commit -m "Add backend API client for rates and balance"
```

---

### Task 6: Rates store

**Files:**
- Create: `frontend/src/stores/rates.ts`
- Create: `frontend/src/stores/rates.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/stores/rates.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRatesStore } from './rates'
import * as api from '../lib/api'

const sampleRates: api.RatesResponse = {
  rates: {
    NIM: { EUR: 0.01, USD: 0.011, GBP: 0.009, CHF: 0.0095 },
    USDT: { EUR: 0.92, USD: 1.0, GBP: 0.79, CHF: 0.88 },
    BTC: { EUR: 55000, USD: 64000, GBP: 48000, CHF: 51000 },
    ETH: { EUR: 1400, USD: 1600, GBP: 1200, CHF: 1300 },
  },
  timestamp: '2026-06-13T16:30:00Z',
  fetched_at: '2026-06-13T16:30:00Z',
  stale: false,
  source: 'CoinGecko',
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
})

describe('useRatesStore', () => {
  it('loads rates and is not stale right after loading', async () => {
    vi.spyOn(api, 'fetchRates').mockResolvedValue(sampleRates)

    const store = useRatesStore()
    await store.load()

    expect(store.rates?.source).toBe('CoinGecko')
    expect(store.error).toBeNull()
    expect(store.isStale).toBe(false)
  })

  it('records an error and leaves rates null when the fetch fails', async () => {
    vi.spyOn(api, 'fetchRates').mockRejectedValue(new Error('rates request failed: 503'))

    const store = useRatesStore()
    await store.load()

    expect(store.rates).toBeNull()
    expect(store.error).toBe('rates request failed: 503')
  })

  it('treats rates as stale once the backend marks them stale', async () => {
    vi.spyOn(api, 'fetchRates').mockResolvedValue({ ...sampleRates, stale: true })

    const store = useRatesStore()
    await store.load()

    expect(store.isStale).toBe(true)
  })

  it('treats rates as stale once fetched_at is older than 60 seconds', async () => {
    const old = new Date(Date.now() - 61_000).toISOString()
    vi.spyOn(api, 'fetchRates').mockResolvedValue({ ...sampleRates, fetched_at: old })

    const store = useRatesStore()
    await store.load()

    expect(store.isStale).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: FAIL — `Failed to resolve import "./rates"`

- [ ] **Step 3: Implement the rates store**

Create `frontend/src/stores/rates.ts`:

```ts
import { defineStore } from 'pinia'
import { fetchRates, type RatesResponse } from '../lib/api'

const STALE_AFTER_MS = 60_000

export const useRatesStore = defineStore('rates', {
  state: () => ({
    rates: null as RatesResponse | null,
    error: null as string | null,
    loading: false,
  }),
  getters: {
    isStale(state): boolean {
      if (!state.rates) return false
      if (state.rates.stale) return true
      return Date.now() - new Date(state.rates.fetched_at).getTime() > STALE_AFTER_MS
    },
  },
  actions: {
    async load() {
      this.loading = true
      this.error = null
      try {
        this.rates = await fetchRates()
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
      } finally {
        this.loading = false
      }
    },
  },
})
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/maestro/Documents/projects/NimiqLens
git add frontend/src/stores/rates.ts frontend/src/stores/rates.test.ts
git commit -m "Add rates store with staleness detection"
```

---

### Task 7: Nimiq provider wrapper and wallet store

**Files:**
- Create: `frontend/src/lib/nimiq.ts`
- Create: `frontend/src/stores/wallet.ts`
- Create: `frontend/src/stores/wallet.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/stores/wallet.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWalletStore } from './wallet'
import * as nimiq from '../lib/nimiq'
import * as api from '../lib/api'

const ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

beforeEach(() => {
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
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: FAIL — `Failed to resolve import "./wallet"` / `"../lib/nimiq"`

- [ ] **Step 3: Implement the Nimiq provider wrapper**

Create `frontend/src/lib/nimiq.ts`:

```ts
import { init } from '@nimiq/mini-app-sdk'

export type NimiqProvider = Awaited<ReturnType<typeof init>>

/**
 * Initializes the Nimiq Pay provider. Returns null (instead of throwing) when
 * the app is not running inside Nimiq Pay or initialization times out, so the
 * app can fall back to a non-wallet experience.
 */
export async function initNimiq(timeout = 10_000): Promise<NimiqProvider | null> {
  try {
    return await init({ timeout })
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Implement the wallet store**

Create `frontend/src/stores/wallet.ts`:

```ts
import { defineStore } from 'pinia'
import { initNimiq, type NimiqProvider } from '../lib/nimiq'
import { fetchBalance } from '../lib/api'
import { shortenAddress } from '../lib/address'

export const useWalletStore = defineStore('wallet', {
  state: () => ({
    provider: null as NimiqProvider | null,
    isInsideNimiqPay: false,
    initialized: false,
    address: null as string | null,
    balanceNim: null as number | null,
    balanceError: null as string | null,
  }),
  getters: {
    shortAddress: (state): string | null => (state.address ? shortenAddress(state.address) : null),
  },
  actions: {
    async init() {
      this.provider = await initNimiq()
      this.isInsideNimiqPay = this.provider !== null
      this.initialized = true
    },
    async connect() {
      if (!this.provider) return
      const accounts = await this.provider.listAccounts()
      this.address = accounts[0] ?? null
      if (this.address) await this.loadBalance()
    },
    async loadBalance() {
      if (!this.address) return
      this.balanceError = null
      try {
        const resp = await fetchBalance(this.address)
        this.balanceNim = resp.balance_nim
      } catch (e) {
        this.balanceError = e instanceof Error ? e.message : String(e)
        this.balanceNim = null
      }
    },
  },
})
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /home/maestro/Documents/projects/NimiqLens
git add frontend/src/lib/nimiq.ts frontend/src/stores/wallet.ts frontend/src/stores/wallet.test.ts
git commit -m "Add Nimiq provider wrapper and wallet store"
```

---

### Task 8: Router, Pinia wiring, and app shell

**Files:**
- Create: `frontend/src/router/index.ts`
- Create: `frontend/src/views/WelcomeView.vue` (minimal placeholder, replaced in Task 9)
- Create: `frontend/src/views/ConverterView.vue` (minimal placeholder, replaced in Task 10)
- Create: `frontend/src/views/ScanView.vue` (minimal placeholder, replaced in Task 9)
- Create: `frontend/src/views/RatesView.vue` (minimal placeholder, replaced in Task 11)
- Create: `frontend/src/views/AboutView.vue` (minimal placeholder, replaced in Task 9)
- Modify: `frontend/src/main.ts`
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: Create placeholder views**

Create each of the following with a one-line template so the router has real components to mount (each is replaced with full content in later tasks):

`frontend/src/views/WelcomeView.vue`:
```vue
<template>
  <div class="p-4">Welcome</div>
</template>
```

`frontend/src/views/ConverterView.vue`:
```vue
<template>
  <div class="p-4">Converter</div>
</template>
```

`frontend/src/views/ScanView.vue`:
```vue
<template>
  <div class="p-4">Scan</div>
</template>
```

`frontend/src/views/RatesView.vue`:
```vue
<template>
  <div class="p-4">Rates</div>
</template>
```

`frontend/src/views/AboutView.vue`:
```vue
<template>
  <div class="p-4">About</div>
</template>
```

- [ ] **Step 2: Create the router**

Create `frontend/src/router/index.ts`:

```ts
import { createRouter, createWebHistory } from 'vue-router'
import WelcomeView from '../views/WelcomeView.vue'
import ConverterView from '../views/ConverterView.vue'
import ScanView from '../views/ScanView.vue'
import RatesView from '../views/RatesView.vue'
import AboutView from '../views/AboutView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'welcome', component: WelcomeView },
    { path: '/convert', name: 'convert', component: ConverterView },
    { path: '/scan', name: 'scan', component: ScanView },
    { path: '/rates', name: 'rates', component: RatesView },
    { path: '/about', name: 'about', component: AboutView },
  ],
})
```

- [ ] **Step 3: Wire Pinia and the router into main.ts**

Replace `frontend/src/main.ts` with:

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './style.css'

createApp(App).use(createPinia()).use(router).mount('#app')
```

- [ ] **Step 4: Build the app shell with bottom navigation**

Replace `frontend/src/App.vue` with:

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useWalletStore } from './stores/wallet'

const walletStore = useWalletStore()

onMounted(() => {
  walletStore.init()
})
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-white">
    <router-view />
    <nav class="fixed bottom-0 inset-x-0 bg-slate-900 border-t border-slate-800 flex">
      <router-link to="/" class="flex-1 text-center py-3 min-h-[44px] text-sm">Home</router-link>
      <router-link to="/convert" class="flex-1 text-center py-3 min-h-[44px] text-sm">Convert</router-link>
      <router-link to="/scan" class="flex-1 text-center py-3 min-h-[44px] text-sm">Scan</router-link>
      <router-link to="/rates" class="flex-1 text-center py-3 min-h-[44px] text-sm">Rates</router-link>
      <router-link to="/about" class="flex-1 text-center py-3 min-h-[44px] text-sm">About</router-link>
    </nav>
  </div>
</template>
```

- [ ] **Step 5: Verify the build and dev server**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend
npm run build
npm run dev -- --host &
sleep 2
curl -s http://localhost:5173/ | grep -i NimLens
kill %1
```
Expected: build succeeds, curl output includes `<title>NimLens</title>`.

- [ ] **Step 6: Run the full test suite**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /home/maestro/Documents/projects/NimiqLens
git add frontend/src/router frontend/src/views frontend/src/main.ts frontend/src/App.vue
git commit -m "Add router, Pinia wiring, and app shell with bottom nav"
```

---

### Task 9: Welcome, Scan, and About screens

**Files:**
- Modify: `frontend/src/views/WelcomeView.vue`
- Modify: `frontend/src/views/ScanView.vue`
- Modify: `frontend/src/views/AboutView.vue`

- [ ] **Step 1: Build the Welcome screen**

Replace `frontend/src/views/WelcomeView.vue` with:

```vue
<script setup lang="ts">
import { useWalletStore } from '../stores/wallet'

const walletStore = useWalletStore()
</script>

<template>
  <div class="min-h-screen p-4 pb-24 flex flex-col gap-4">
    <h1 class="text-3xl font-bold">NimLens</h1>
    <p class="text-slate-300">Convert real-world prices to NIM and crypto.</p>

    <button
      v-if="walletStore.isInsideNimiqPay && !walletStore.address"
      type="button"
      class="min-h-[44px] rounded-lg bg-emerald-600 px-4 font-medium"
      @click="walletStore.connect()"
    >
      Connect Wallet
    </button>
    <div v-else-if="walletStore.address" class="rounded-lg bg-slate-800 px-4 py-3">
      Connected: {{ walletStore.shortAddress }}
    </div>
    <p v-else-if="walletStore.initialized" class="text-slate-400 text-sm">
      Open this app inside Nimiq Pay to connect your wallet.
    </p>

    <router-link
      to="/convert"
      class="min-h-[44px] rounded-lg bg-slate-800 px-4 py-3 font-medium text-center flex items-center justify-center"
    >
      Start manual conversion
    </router-link>
    <router-link
      to="/scan"
      class="min-h-[44px] rounded-lg bg-slate-800 px-4 py-3 font-medium text-center flex items-center justify-center"
    >
      Start camera scan
    </router-link>
  </div>
</template>
```

- [ ] **Step 2: Build the Scan screen (manual-entry fallback for now)**

Replace `frontend/src/views/ScanView.vue` with:

```vue
<template>
  <div class="min-h-screen p-4 pb-24 flex flex-col gap-4">
    <h1 class="text-2xl font-bold">Camera Scan</h1>
    <p class="text-slate-300">
      Camera-based price scanning is coming in a future update. For now, enter the price
      manually to see the conversion.
    </p>
    <router-link
      to="/convert"
      class="min-h-[44px] rounded-lg bg-slate-800 px-4 py-3 font-medium text-center flex items-center justify-center"
    >
      Enter price manually
    </router-link>
  </div>
</template>
```

- [ ] **Step 3: Build the About screen**

Replace `frontend/src/views/AboutView.vue` with:

```vue
<template>
  <div class="min-h-screen p-4 pb-24 flex flex-col gap-4">
    <h1 class="text-2xl font-bold">About NimLens</h1>
    <p class="text-slate-300">
      NimLens converts real-world fiat prices into NIM, USDT, BTC, and ETH so you can quickly
      see what something is worth in crypto.
    </p>

    <h2 class="text-lg font-semibold">Nimiq Pay integration</h2>
    <p class="text-slate-300">
      NimLens connects to your Nimiq Pay wallet only when you tap "Connect Wallet". It reads
      your address to check your NIM balance and never accesses your private keys or seed
      phrase. Any NIM transaction requires your explicit confirmation through Nimiq Pay's
      native approval dialog.
    </p>

    <h2 class="text-lg font-semibold">Privacy</h2>
    <p class="text-slate-300">
      Camera scanning (when available) runs entirely on your device — no images are uploaded
      or stored. NimLens does not track you and stores no personal data.
    </p>

    <h2 class="text-lg font-semibold">Open source</h2>
    <p class="text-slate-300">
      NimLens is open source under the MIT license. The source code is included in this
      project's repository.
    </p>
  </div>
</template>
```

- [ ] **Step 4: Run the full test suite and build**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test && npm run build
```
Expected: PASS, build succeeds

- [ ] **Step 5: Commit**

```bash
cd /home/maestro/Documents/projects/NimiqLens
git add frontend/src/views/WelcomeView.vue frontend/src/views/ScanView.vue frontend/src/views/AboutView.vue
git commit -m "Add Welcome, Scan, and About screens"
```

---

### Task 10: Converter screen

**Files:**
- Modify: `frontend/src/views/ConverterView.vue`
- Create: `frontend/src/views/ConverterView.test.ts`

- [ ] **Step 1: Write the failing component tests**

Create `frontend/src/views/ConverterView.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ConverterView from './ConverterView.vue'
import { useRatesStore } from '../stores/rates'
import { useWalletStore } from '../stores/wallet'
import type { RatesResponse } from '../lib/api'

const sampleRates: RatesResponse = {
  rates: {
    NIM: { EUR: 0.01, USD: 0.011, GBP: 0.009, CHF: 0.0095 },
    USDT: { EUR: 0.92, USD: 1.0, GBP: 0.79, CHF: 0.88 },
    BTC: { EUR: 55000, USD: 64000, GBP: 48000, CHF: 51000 },
    ETH: { EUR: 1400, USD: 1600, GBP: 1200, CHF: 1300 },
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

  it('shows the stale-rate banner when rates are stale', () => {
    const ratesStore = useRatesStore()
    ratesStore.$patch({ rates: { ...sampleRates, stale: true } })

    const wrapper = mount(ConverterView)

    expect(wrapper.text()).toContain('may be outdated')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: FAIL — placeholder `ConverterView.vue` does not contain a `<input type="number">` or the expected text

- [ ] **Step 3: Implement the Converter screen**

Replace `frontend/src/views/ConverterView.vue` with:

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRatesStore } from '../stores/rates'
import { useWalletStore } from '../stores/wallet'
import { ASSETS, FIAT_CURRENCIES, computeAssetAmount, formatAssetAmount, type Asset, type FiatCurrency } from '../lib/convert'
import { affordability } from '../lib/affordability'

const ratesStore = useRatesStore()
const walletStore = useWalletStore()

const price = ref<number | null>(null)
const currency = ref<FiatCurrency>('EUR')

onMounted(() => {
  if (!ratesStore.rates) ratesStore.load()
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
  <div class="min-h-screen p-4 pb-24">
    <h1 class="text-2xl font-bold mb-4">Price Lens</h1>

    <div
      v-if="ratesStore.isStale"
      class="mb-4 rounded-lg bg-amber-900/40 border border-amber-600 px-3 py-2 text-sm text-amber-200"
    >
      Rates from {{ ratesStore.rates ? relativeTime(ratesStore.rates.fetched_at) : 'an unknown time' }} ago — may be outdated
    </div>
    <div
      v-else-if="ratesStore.error && !ratesStore.rates"
      class="mb-4 rounded-lg bg-red-900/40 border border-red-600 px-3 py-2 text-sm text-red-200"
    >
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
        class="flex-1 min-h-[44px] rounded-lg bg-slate-800 px-3 text-xl"
      />
      <select v-model="currency" class="min-h-[44px] rounded-lg bg-slate-800 px-3 text-xl">
        <option v-for="c in FIAT_CURRENCIES" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>

    <div v-if="conversions" class="grid grid-cols-2 gap-3 mb-4">
      <div v-for="asset in ASSETS" :key="asset" class="rounded-xl bg-slate-800 p-4">
        <div class="text-sm text-slate-400">{{ asset }}</div>
        <div class="text-2xl font-semibold">{{ conversions[asset] }}</div>
      </div>
    </div>

    <div v-if="affordabilityResult" class="rounded-xl bg-slate-800 p-4">
      <div v-if="affordabilityResult.affordable" class="text-emerald-400 font-medium">
        You can afford this with your NIM balance
      </div>
      <div v-else class="text-amber-400 font-medium">
        You need ≈ {{ affordabilityResult.deficit.toFixed(2) }} more NIM
      </div>
    </div>
    <div
      v-else-if="walletStore.address && walletStore.balanceError"
      class="rounded-xl bg-slate-800 p-4 text-slate-400"
    >
      Balance unavailable
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/maestro/Documents/projects/NimiqLens
git add frontend/src/views/ConverterView.vue frontend/src/views/ConverterView.test.ts
git commit -m "Add Converter screen with conversion cards and affordability"
```

---

### Task 11: Rates screen

**Files:**
- Modify: `frontend/src/views/RatesView.vue`
- Create: `frontend/src/views/RatesView.test.ts`

- [ ] **Step 1: Write the failing component test**

Create `frontend/src/views/RatesView.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import RatesView from './RatesView.vue'
import { useRatesStore } from '../stores/rates'
import type { RatesResponse } from '../lib/api'

const sampleRates: RatesResponse = {
  rates: {
    NIM: { EUR: 0.01, USD: 0.011, GBP: 0.009, CHF: 0.0095 },
    USDT: { EUR: 0.92, USD: 1.0, GBP: 0.79, CHF: 0.88 },
    BTC: { EUR: 55000, USD: 64000, GBP: 48000, CHF: 51000 },
    ETH: { EUR: 1400, USD: 1600, GBP: 1200, CHF: 1300 },
  },
  timestamp: '2026-06-13T16:30:00Z',
  fetched_at: new Date().toISOString(),
  stale: false,
  source: 'CoinGecko',
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('RatesView', () => {
  it('shows the rates table, source, and timestamp when rates are loaded', () => {
    const ratesStore = useRatesStore()
    ratesStore.$patch({ rates: sampleRates })

    const wrapper = mount(RatesView)
    const text = wrapper.text()

    expect(text).toContain('NIM')
    expect(text).toContain('BTC')
    expect(text).toContain('ETH')
    expect(text).toContain('USDT')
    expect(text).toContain('CoinGecko')
  })

  it('shows the stale banner when rates are stale', () => {
    const ratesStore = useRatesStore()
    ratesStore.$patch({ rates: { ...sampleRates, stale: true } })

    const wrapper = mount(RatesView)

    expect(wrapper.text()).toContain('may be outdated')
  })

  it('shows an unavailable message when loading failed with no cached rates', () => {
    const ratesStore = useRatesStore()
    ratesStore.$patch({ rates: null, error: 'rates request failed: 503' })

    const wrapper = mount(RatesView)

    expect(wrapper.text()).toContain('unavailable')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: FAIL — placeholder `RatesView.vue` does not contain the expected text

- [ ] **Step 3: Implement the Rates screen**

Replace `frontend/src/views/RatesView.vue` with:

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRatesStore } from '../stores/rates'
import { ASSETS, FIAT_CURRENCIES } from '../lib/convert'

const ratesStore = useRatesStore()

onMounted(() => {
  if (!ratesStore.rates) ratesStore.load()
})
</script>

<template>
  <div class="min-h-screen p-4 pb-24">
    <h1 class="text-2xl font-bold mb-4">Exchange Rates</h1>

    <div v-if="ratesStore.rates">
      <div
        v-if="ratesStore.isStale"
        class="mb-4 rounded-lg bg-amber-900/40 border border-amber-600 px-3 py-2 text-sm text-amber-200"
      >
        These rates may be outdated.
      </div>

      <table class="w-full text-left mb-4">
        <thead>
          <tr class="text-slate-400 text-sm">
            <th class="py-2">Asset</th>
            <th v-for="c in FIAT_CURRENCIES" :key="c" class="py-2">{{ c }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="asset in ASSETS" :key="asset" class="border-t border-slate-800">
            <td class="py-2 font-medium">{{ asset }}</td>
            <td v-for="c in FIAT_CURRENCIES" :key="c" class="py-2">{{ ratesStore.rates.rates[asset][c] }}</td>
          </tr>
        </tbody>
      </table>

      <p class="text-sm text-slate-400">
        Last updated: {{ new Date(ratesStore.rates.fetched_at).toLocaleString() }}
      </p>
      <p class="text-sm text-slate-400">Source: {{ ratesStore.rates.source }}</p>
    </div>
    <p v-else-if="ratesStore.error" class="text-red-300">Rates unavailable — try again later</p>
    <p v-else class="text-slate-400">Loading rates…</p>
  </div>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/maestro/Documents/projects/NimiqLens
git add frontend/src/views/RatesView.vue frontend/src/views/RatesView.test.ts
git commit -m "Add Rates screen with table, timestamp, and source attribution"
```

---

### Task 12: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend test suite and build**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test && npm run build
```
Expected: all tests PASS, build succeeds with no TypeScript errors

- [ ] **Step 2: Run the backend**

```bash
cd /home/maestro/Documents/projects/NimiqLens/backend && go run . &
```
Note the port it logs (default `8787` unless `PORT` is set).

- [ ] **Step 3: Run the frontend against the live backend**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend
VITE_API_BASE_URL=http://localhost:8787 npm run dev -- --host &
sleep 2
curl -s http://localhost:5173/ | grep -i NimLens
```
Expected: curl output includes `<title>NimLens</title>`.

- [ ] **Step 4: Verify the Rates screen renders live data**

Open `http://localhost:5173/rates` in a browser (or `curl -s http://localhost:5173/rates` for the HTML shell — the data loads client-side, so use a browser or the Playwright/mobile MCP tooling available in this environment to confirm the table populates with live NIM/USDT/BTC/ETH rates from `/api/rates`).

- [ ] **Step 5: Verify the Converter screen with a manual price**

In the browser, go to `http://localhost:5173/convert`, enter `12.99` with currency `EUR`, and confirm all four conversion cards (NIM, USDT, BTC, ETH) show `≈` values computed from the live rates.

- [ ] **Step 6: Verify inside Nimiq Pay on a phone (LAN)**

Note the Network URL Vite prints (e.g. `http://192.168.x.x:5173`). On a phone with Nimiq Pay installed, on the same Wi-Fi network:
1. Open Nimiq Pay → Mini Apps
2. Enter the Network URL
3. Confirm the Welcome screen shows a "Connect Wallet" button (the app detected it's running inside Nimiq Pay via `init()`)
4. Navigate to Convert and confirm conversions work identically to the browser test in Step 5

If the phone can't reach the dev machine, ensure both are on the same Wi-Fi network and that `VITE_API_BASE_URL` points at the dev machine's LAN IP (not `localhost`), since `localhost` inside the Nimiq Pay WebView resolves to the phone.

- [ ] **Step 7: Stop dev servers**

```bash
kill %1 %2 2>/dev/null
```

---

## Self-Review Notes

- **Spec coverage:** Vite + Vue 3 + TS + Tailwind scaffold (Task 1), Pinia/Router/SDK/Vitest (Task 2), conversion math + decimal formatting per §6 (Task 3), address shortening + affordability (Task 4), backend API client for `/api/rates` and `/api/balance/:address` (Task 5), `ratesStore` with the 60s staleness rule from §8 (Task 6), `init()`/`isInsideNimiqPay`/`listAccounts`/balance via `walletStore` (Task 7), all 5 routes + bottom nav (Task 8), Welcome/Scan/About screens (Task 9), Converter screen with conversion cards + affordability messaging (Task 10), Rates screen with table/timestamp/source (Task 11), live + on-device verification (Task 12).
- **Deferred to later phases (per the phased plan):** the Scan screen's camera/OCR flow (Phase 4), the tip button (Phase 5), and `docs/privacy.md`/`docs/submission.md`/`docs/dev-guide.md` (Phase 5) are intentionally not part of this plan.
- **Type consistency:** `Asset`/`FiatCurrency`/`ASSETS`/`FIAT_CURRENCIES` defined once in `convert.ts` (Task 3) and reused by `api.ts` (Task 5), `ConverterView.vue` (Task 10), and `RatesView.vue` (Task 11). `RatesResponse`/`BalanceResponse` defined once in `api.ts` (Task 5) and reused by `rates.ts`/`wallet.ts` stores (Tasks 6-7) and both view tests (Tasks 10-11). `shortAddress`/`balanceNim`/`balanceError`/`isInsideNimiqPay`/`address` getters and state defined in `wallet.ts` (Task 7) match their usage in `WelcomeView.vue` (Task 9) and `ConverterView.vue` (Task 10).
