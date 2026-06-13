# NimLens Phase 3 — Camera / OCR Price Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Camera Scan screen from the design spec: on-device OCR price detection from the camera, a confirm/edit step, and a handoff to the Converter screen with the detected price pre-filled.

**Architecture:** Two new pure logic modules — `priceDetection.ts` (regex-based price/currency extraction from OCR text) and `ocr.ts` (a thin wrapper that dynamically imports `tesseract.js` so it's only downloaded when scanning starts). A small Pinia `scanStore` holds a "pending price" set by the Scan screen and consumed once by the Converter screen on mount. `ScanView.vue` is rewritten with the full camera → capture → OCR → confirm/edit flow, with `getUserMedia` and Tesseract requested only on explicit user action.

**Tech Stack:** Vue 3 + TypeScript (continuing Phase 2's stack), `tesseract.js` (browser OCR, WASM, dynamically imported), Vitest + `@vue/test-utils`.

---

## File Structure

```
frontend/src/
├── lib/
│   ├── priceDetection.ts
│   ├── priceDetection.test.ts
│   ├── ocr.ts
│   └── ocr.test.ts
├── stores/
│   ├── scan.ts
│   └── scan.test.ts
└── views/
    ├── ScanView.vue        (rewritten)
    ├── ScanView.test.ts
    ├── ConverterView.vue   (modified: consume pending price from scanStore)
    └── ConverterView.test.ts (modified: add prefill tests)
```

---

### Task 1: Price detection from OCR text

**Files:**
- Create: `frontend/src/lib/priceDetection.ts`
- Create: `frontend/src/lib/priceDetection.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/priceDetection.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { detectPrice } from './priceDetection'

describe('detectPrice', () => {
  it('detects a symbol-prefixed euro price', () => {
    expect(detectPrice('€12.99')).toEqual({ amount: 12.99, currency: 'EUR' })
  })

  it('detects a European-formatted price with a EUR code suffix', () => {
    expect(detectPrice('12,99 EUR')).toEqual({ amount: 12.99, currency: 'EUR' })
  })

  it('detects a symbol-prefixed dollar price', () => {
    expect(detectPrice('$24.50')).toEqual({ amount: 24.5, currency: 'USD' })
  })

  it('detects a price with a USD code suffix', () => {
    expect(detectPrice('24.50 USD')).toEqual({ amount: 24.5, currency: 'USD' })
  })

  it('detects a symbol-prefixed pound price', () => {
    expect(detectPrice('£9.99')).toEqual({ amount: 9.99, currency: 'GBP' })
  })

  it('detects a CHF-prefixed price', () => {
    expect(detectPrice('CHF 12.99')).toEqual({ amount: 12.99, currency: 'CHF' })
  })

  it('detects a Fr.-prefixed price', () => {
    expect(detectPrice('Fr. 9.50')).toEqual({ amount: 9.5, currency: 'CHF' })
  })

  it('detects a price with thousands separators', () => {
    expect(detectPrice('€1.234,56')).toEqual({ amount: 1234.56, currency: 'EUR' })
  })

  it('finds a price within surrounding receipt text', () => {
    expect(detectPrice('Total\n€12.99\nThank you')).toEqual({ amount: 12.99, currency: 'EUR' })
  })

  it('returns null when no price-like pattern is found', () => {
    expect(detectPrice('Open 9am - 5pm')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: FAIL — `Failed to resolve import "./priceDetection"`

- [ ] **Step 3: Implement price detection**

Create `frontend/src/lib/priceDetection.ts`:

```ts
import type { FiatCurrency } from './convert'

export interface DetectedPrice {
  amount: number
  currency: FiatCurrency
}

// Matches "1.234,56" / "1,234.56" (grouped) or "12.99" / "1234" / "1234.56" (plain).
const NUMBER = '\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?'

const SYMBOL_CURRENCY: Record<string, FiatCurrency> = {
  '€': 'EUR',
  $: 'USD',
  '£': 'GBP',
}

interface PricePattern {
  regex: RegExp
  currency: (match: RegExpMatchArray) => FiatCurrency
  amount: (match: RegExpMatchArray) => string
}

const PATTERNS: PricePattern[] = [
  // €12.99, $24.50, £9.99
  {
    regex: new RegExp(`([€$£])\\s?(${NUMBER})`),
    currency: (m) => SYMBOL_CURRENCY[m[1]],
    amount: (m) => m[2],
  },
  // 12,99 EUR / 24.50 USD / 9.99 GBP / 12.99 CHF
  {
    regex: new RegExp(`(${NUMBER})\\s?(EUR|USD|GBP|CHF)`, 'i'),
    currency: (m) => m[2].toUpperCase() as FiatCurrency,
    amount: (m) => m[1],
  },
  // CHF 12.99, Fr. 9.50, Fr 9.50
  {
    regex: new RegExp(`(?:CHF|Fr\\.?)\\s?(${NUMBER})`, 'i'),
    currency: () => 'CHF',
    amount: (m) => m[1],
  },
]

/** Parses a number string that may use "." or "," as the decimal or thousands separator. */
function parseAmount(raw: string): number {
  const hasComma = raw.includes(',')
  const hasDot = raw.includes('.')

  if (hasComma && hasDot) {
    const decimalSep = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.'
    const thousandsSep = decimalSep === ',' ? '.' : ','
    return Number.parseFloat(raw.split(thousandsSep).join('').replace(decimalSep, '.'))
  }

  if (hasComma || hasDot) {
    const sep = hasComma ? ',' : '.'
    const parts = raw.split(sep)
    if (parts.length === 2 && parts[1].length === 2) {
      return Number.parseFloat(parts.join('.'))
    }
    return Number.parseFloat(parts.join(''))
  }

  return Number.parseFloat(raw)
}

/**
 * Scans OCR'd text for a price-like pattern (symbol-prefixed, code-suffixed, or
 * CHF/Fr.-prefixed) and returns the first match found, or null if none.
 */
export function detectPrice(text: string): DetectedPrice | null {
  for (const pattern of PATTERNS) {
    const match = text.match(pattern.regex)
    if (!match) continue

    const amount = parseAmount(pattern.amount(match))
    if (Number.isNaN(amount)) continue

    return { amount, currency: pattern.currency(match) }
  }
  return null
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
git add frontend/src/lib/priceDetection.ts frontend/src/lib/priceDetection.test.ts
git commit -m "Add OCR price-pattern detection"
```

---

### Task 2: Tesseract.js OCR wrapper

**Files:**
- Modify: `frontend/package.json` (add `tesseract.js` dependency)
- Create: `frontend/src/lib/ocr.ts`
- Create: `frontend/src/lib/ocr.test.ts`

- [ ] **Step 1: Install tesseract.js**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm install tesseract.js
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/lib/ocr.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('tesseract.js', () => ({
  default: {
    recognize: vi.fn(async () => ({ data: { text: '€12.99' } })),
  },
}))

import { recognizeText } from './ocr'

describe('recognizeText', () => {
  it('returns the text recognized from the image', async () => {
    const canvas = document.createElement('canvas')
    await expect(recognizeText(canvas)).resolves.toBe('€12.99')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: FAIL — `Failed to resolve import "./ocr"`

- [ ] **Step 4: Implement the OCR wrapper**

Create `frontend/src/lib/ocr.ts`:

```ts
/**
 * Recognizes text in an image using Tesseract.js. The library (and its WASM
 * payload) is dynamically imported here so it is only downloaded when a scan
 * is actually performed, keeping it out of the main bundle.
 */
export async function recognizeText(image: HTMLCanvasElement): Promise<string> {
  const { default: Tesseract } = await import('tesseract.js')
  const result = await Tesseract.recognize(image, 'eng')
  return result.data.text
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
git add frontend/package.json frontend/package-lock.json frontend/src/lib/ocr.ts frontend/src/lib/ocr.test.ts
git commit -m "Add lazy-loaded Tesseract.js OCR wrapper"
```

---

### Task 3: Scan-to-Converter handoff store

**Files:**
- Create: `frontend/src/stores/scan.ts`
- Create: `frontend/src/stores/scan.test.ts`
- Modify: `frontend/src/views/ConverterView.vue:1-16`
- Modify: `frontend/src/views/ConverterView.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/stores/scan.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useScanStore } from './scan'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useScanStore', () => {
  it('starts with no pending price', () => {
    const store = useScanStore()
    expect(store.pendingPrice).toBeNull()
    expect(store.pendingCurrency).toBeNull()
  })

  it('stores a pending price and currency', () => {
    const store = useScanStore()
    store.setPending(12.99, 'EUR')
    expect(store.pendingPrice).toBe(12.99)
    expect(store.pendingCurrency).toBe('EUR')
  })

  it('clears the pending price and currency', () => {
    const store = useScanStore()
    store.setPending(12.99, 'EUR')
    store.clearPending()
    expect(store.pendingPrice).toBeNull()
    expect(store.pendingCurrency).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: FAIL — `Failed to resolve import "./scan"`

- [ ] **Step 3: Implement the scan store**

Create `frontend/src/stores/scan.ts`:

```ts
import { defineStore } from 'pinia'
import type { FiatCurrency } from '../lib/convert'

export const useScanStore = defineStore('scan', {
  state: () => ({
    pendingPrice: null as number | null,
    pendingCurrency: null as FiatCurrency | null,
  }),
  actions: {
    setPending(price: number, currency: FiatCurrency) {
      this.pendingPrice = price
      this.pendingCurrency = currency
    },
    clearPending() {
      this.pendingPrice = null
      this.pendingCurrency = null
    },
  },
})
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: PASS

- [ ] **Step 5: Write the failing prefill test for ConverterView**

In `frontend/src/views/ConverterView.test.ts`, add this import alongside the existing ones at the top of the file:

```ts
import { useScanStore } from '../stores/scan'
```

Then add this new test at the end of the `describe('ConverterView', ...)` block, after the `'shows the stale-rate banner when rates are stale'` test:

```ts
  it('prefills the price and currency from a pending scan result', () => {
    const ratesStore = useRatesStore()
    ratesStore.$patch({ rates: sampleRates })
    const scanStore = useScanStore()
    scanStore.setPending(24.5, 'USD')

    const wrapper = mount(ConverterView)

    const input = wrapper.find('input[type="number"]').element as HTMLInputElement
    const select = wrapper.find('select').element as HTMLSelectElement
    expect(input.value).toBe('24.5')
    expect(select.value).toBe('USD')
    expect(scanStore.pendingPrice).toBeNull()
  })
```

- [ ] **Step 6: Run the tests to verify the new test fails**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: FAIL — input value is empty / select value is `EUR`, not `24.5` / `USD`

- [ ] **Step 7: Wire the scan store into ConverterView**

In `frontend/src/views/ConverterView.vue`, update the `<script setup>` block (lines 1-16):

```ts
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRatesStore } from '../stores/rates'
import { useWalletStore } from '../stores/wallet'
import { useScanStore } from '../stores/scan'
import { ASSETS, FIAT_CURRENCIES, computeAssetAmount, formatAssetAmount, type Asset, type FiatCurrency } from '../lib/convert'
import { affordability } from '../lib/affordability'

const ratesStore = useRatesStore()
const walletStore = useWalletStore()
const scanStore = useScanStore()

const price = ref<number | null>(null)
const currency = ref<FiatCurrency>('EUR')

onMounted(() => {
  if (!ratesStore.rates) ratesStore.load()

  if (scanStore.pendingPrice !== null && scanStore.pendingCurrency !== null) {
    price.value = scanStore.pendingPrice
    currency.value = scanStore.pendingCurrency
    scanStore.clearPending()
  }
})
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd /home/maestro/Documents/projects/NimiqLens
git add frontend/src/stores/scan.ts frontend/src/stores/scan.test.ts frontend/src/views/ConverterView.vue frontend/src/views/ConverterView.test.ts
git commit -m "Add scan store and prefill Converter from a pending scan result"
```

---

### Task 4: Camera Scan screen

**Files:**
- Modify: `frontend/src/views/ScanView.vue` (full rewrite)
- Create: `frontend/src/views/ScanView.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/views/ScanView.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ScanView from './ScanView.vue'

const stubs = { RouterLink: { template: '<a><slot /></a>' } }

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('ScanView', () => {
  it('shows the on-device privacy note', () => {
    const wrapper = mount(ScanView, { global: { stubs } })
    expect(wrapper.text()).toContain('processed entirely on your device')
  })

  it('shows a fallback message when the camera is unavailable', () => {
    // jsdom has no navigator.mediaDevices, so the camera-unavailable
    // fallback is always the path exercised in unit tests.
    const wrapper = mount(ScanView, { global: { stubs } })
    expect(wrapper.text()).toContain("Camera access isn't available")
  })

  it('always offers manual price entry', () => {
    const wrapper = mount(ScanView, { global: { stubs } })
    expect(wrapper.text()).toContain('Enter price manually')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: FAIL — the current `ScanView.vue` placeholder has no privacy note or camera-unavailable message

- [ ] **Step 3: Rewrite the Scan screen**

Replace the entire contents of `frontend/src/views/ScanView.vue`:

```vue
<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useScanStore } from '../stores/scan'
import { detectPrice } from '../lib/priceDetection'
import { recognizeText } from '../lib/ocr'
import { FIAT_CURRENCIES, type FiatCurrency } from '../lib/convert'

const router = useRouter()
const scanStore = useScanStore()

const cameraSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const stream = ref<MediaStream | null>(null)
const cameraError = ref<string | null>(null)
const scanning = ref(false)
const noPriceFound = ref(false)
const detected = ref(false)
const editAmount = ref<number | null>(null)
const editCurrency = ref<FiatCurrency>('EUR')

async function startCamera() {
  cameraError.value = null
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    if (videoRef.value) {
      videoRef.value.srcObject = stream.value
      await videoRef.value.play()
    }
  } catch (e) {
    cameraError.value = e instanceof Error ? e.message : String(e)
  }
}

function stopCamera() {
  stream.value?.getTracks().forEach((track) => track.stop())
  stream.value = null
}

async function scan() {
  if (!videoRef.value || !canvasRef.value) return

  scanning.value = true
  noPriceFound.value = false
  try {
    const video = videoRef.value
    const canvas = canvasRef.value
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const text = await recognizeText(canvas)
    const price = detectPrice(text)
    if (price) {
      detected.value = true
      editAmount.value = price.amount
      editCurrency.value = price.currency
    } else {
      noPriceFound.value = true
    }
  } finally {
    scanning.value = false
  }
}

function retry() {
  detected.value = false
  noPriceFound.value = false
}

function confirm() {
  if (editAmount.value === null) return
  scanStore.setPending(editAmount.value, editCurrency.value)
  stopCamera()
  router.push('/convert')
}

onUnmounted(() => {
  stopCamera()
})
</script>

<template>
  <div class="min-h-screen p-4 pb-24 flex flex-col gap-4">
    <h1 class="text-2xl font-bold">Camera Scan</h1>
    <p class="text-sm text-slate-400">
      Frames are processed entirely on your device — nothing is uploaded or stored.
    </p>

    <div v-if="!cameraSupported" class="rounded-lg bg-slate-800 p-4 text-slate-300">
      Camera access isn't available on this device or browser.
    </div>

    <template v-else>
      <div
        v-if="cameraError"
        class="rounded-lg bg-red-900/40 border border-red-600 px-3 py-2 text-sm text-red-200"
      >
        Camera access failed: {{ cameraError }}
      </div>

      <video ref="videoRef" class="w-full rounded-lg bg-black aspect-video" muted playsinline></video>
      <canvas ref="canvasRef" class="hidden"></canvas>

      <button
        v-if="!stream"
        type="button"
        class="min-h-[44px] rounded-lg bg-emerald-600 px-4 font-medium"
        @click="startCamera"
      >
        Start camera
      </button>
      <button
        v-else
        type="button"
        :disabled="scanning"
        class="min-h-[44px] rounded-lg bg-emerald-600 px-4 font-medium disabled:opacity-50"
        @click="scan"
      >
        {{ scanning ? 'Scanning…' : 'Scan' }}
      </button>

      <div
        v-if="noPriceFound"
        class="rounded-lg bg-amber-900/40 border border-amber-600 px-3 py-2 text-sm text-amber-200"
      >
        No price found — try again, or enter the price manually below.
      </div>

      <div v-if="detected" class="rounded-xl bg-slate-800 p-4 flex flex-col gap-3">
        <div class="text-slate-300">Detected: {{ editAmount }} {{ editCurrency }} — is this correct?</div>
        <div class="flex gap-2">
          <input
            v-model.number="editAmount"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.01"
            class="flex-1 min-h-[44px] rounded-lg bg-slate-900 px-3 text-xl"
          />
          <select v-model="editCurrency" class="min-h-[44px] rounded-lg bg-slate-900 px-3 text-xl">
            <option v-for="c in FIAT_CURRENCIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <button type="button" class="min-h-[44px] rounded-lg bg-emerald-600 px-4 font-medium" @click="confirm">
          Confirm
        </button>
        <button type="button" class="min-h-[44px] rounded-lg bg-slate-700 px-4 font-medium" @click="retry">
          Try again
        </button>
      </div>
    </template>

    <router-link
      to="/convert"
      class="min-h-[44px] rounded-lg bg-slate-800 px-4 py-3 font-medium text-center flex items-center justify-center"
    >
      Enter price manually
    </router-link>
  </div>
</template>
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: PASS

- [ ] **Step 5: Type-check and build**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run build
```
Expected: builds cleanly with no TypeScript errors

- [ ] **Step 6: Commit**

```bash
cd /home/maestro/Documents/projects/NimiqLens
git add frontend/src/views/ScanView.vue frontend/src/views/ScanView.test.ts
git commit -m "Implement camera scan, OCR, and confirm/edit flow"
```

---

### Task 5: End-to-end and on-device verification

**Files:** none (manual verification only)

- [ ] **Step 1: Run the full test suite**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run test
```
Expected: PASS (all suites, including the new `priceDetection`, `ocr`, `scan`, and `ScanView` tests)

- [ ] **Step 2: Build the frontend**

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run build
```
Expected: builds cleanly with no TypeScript errors

- [ ] **Step 3: Start the backend and frontend dev servers**

```bash
cd /home/maestro/Documents/projects/NimiqLens/backend && go run .
```

In a second terminal:

```bash
cd /home/maestro/Documents/projects/NimiqLens/frontend && npm run dev
```

- [ ] **Step 4: Desktop browser pass**

Open the frontend URL in a desktop browser and navigate to `/scan`:
- Confirm the privacy note ("Frames are processed entirely on your device...") is visible.
- Confirm "Enter price manually" links to `/convert`.
- If the browser supports `getUserMedia` and grants permission: tap "Start camera", point the camera at a printed or on-screen price (e.g. `€12.99`), tap "Scan", and confirm the "Detected: ... — is this correct?" panel shows the right amount and currency.
- Tap "Confirm" and verify the Converter screen opens with the price and currency pre-filled and conversions shown.
- Reload `/scan` and tap "Scan" against text with no price (e.g. a sentence with no numbers) — confirm the "No price found" message appears and "Try again" resets the panel.

- [ ] **Step 5: On-device pass inside Nimiq Pay (LAN)**

Per `docs/superpowers/plans/2026-06-13-nimlens-phase2-frontend.md`'s LAN setup, open the frontend's LAN URL on a phone inside Nimiq Pay:
- Confirm the camera permission prompt appears only after tapping "Start camera" (never on page load).
- Repeat the scan → detect → confirm flow from Step 4 on-device, using `facingMode: 'environment'` (rear camera).
- Confirm no captured frame or image is ever sent over the network (check the browser/devtools network tab — only the Tesseract.js WASM/model assets should load, no image uploads).
- Confirm the "Enter price manually" fallback works if camera permission is denied.

No commit for this task — it is verification of the work committed in Tasks 1-4. If any step fails, fix the issue in the relevant task's files, re-run that task's tests, and commit the fix separately.

---

## Self-Review Notes

- **Spec coverage (§7 Camera/OCR):** "Scan" button triggers `getUserMedia` only on explicit action (Task 4, `startCamera`); captured frame → canvas → Tesseract.js, dynamically imported (Tasks 2 & 4); regex price detection (Task 1); "Detected: ... — is this correct?" confirm/edit UI (Task 4); "Enter manually" always available (Task 4, ScanView; Task 3, ConverterView prefill works whether or not a scan happened); on-device-only privacy note shown on the scan screen (Task 4) — `docs/privacy.md` and the About screen's privacy copy are covered by the Phase 4 (docs & compliance) plan, not this one.
- **Type consistency:** `DetectedPrice` (Task 1) is `{ amount: number; currency: FiatCurrency }`; `useScanStore` (Task 3) stores `pendingPrice: number | null` and `pendingCurrency: FiatCurrency | null`, matching `detected.value`'s `amount`/`currency` fields passed into `scanStore.setPending(editAmount.value, editCurrency.value)` in Task 4. `FiatCurrency` is imported from `../lib/convert` consistently across `priceDetection.ts`, `scan.ts`, and `ScanView.vue`.
- **No `/api/ocr` endpoint:** confirmed — `recognizeText` (Task 2) and `detectPrice` (Task 1) run entirely client-side; no backend changes in this plan.
- **Out of scope for this plan:** the tip button, `docs/privacy.md`, `docs/submission.md`, `docs/dev-guide.md`, README, and `LICENSE` are covered by the Phase 4 (tip button, docs & compliance) plan.
