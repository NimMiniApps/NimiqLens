<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useScanStore } from '../stores/scan'
import { usePreferencesStore } from '../stores/preferences'
import type { DetectedPrice } from '../lib/priceDetection'
import { prepareOcrWorker, terminateOcrWorker } from '../lib/ocr'
import { runOcrPipeline } from '../lib/ocrPipeline'
import { capturePreprocessedCrops, captureTargetCrop, assessFrameQuality, getGrayscaleFromCanvas, TARGET_HEIGHT_RATIO, TARGET_WIDTH_RATIO } from '../lib/scanImage'
import { createPriceCandidateTracker } from '../lib/priceCandidate'
import { FIAT_CURRENCIES, type FiatCurrency } from '../lib/convert'
import IconCamera from '../components/icons/IconCamera.vue'
import IconExchange from '../components/icons/IconExchange.vue'
import IconAlert from '../components/icons/IconAlert.vue'
import IconCheck from '../components/icons/IconCheck.vue'

const LIVE_SAMPLE_INTERVAL_MS = 100

const router = useRouter()
const scanStore = useScanStore()
const preferencesStore = usePreferencesStore()
const priceTracker = createPriceCandidateTracker()

const cameraSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
const insecureContext = typeof globalThis !== 'undefined' && globalThis.isSecureContext === false

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const stream = ref<MediaStream | null>(null)
const cameraError = ref<string | null>(null)
const scannerError = ref<string | null>(null)
const scanning = ref(false)
const ocrReady = ref(false)
const noPriceFound = ref(false)
const detected = ref(false)
const editAmount = ref<number | null>(null)
const editCurrency = ref<FiatCurrency>(preferencesStore.fiatCurrency)
const guidance = ref<'searching' | 'hold-steady' | 'move-closer' | 'too-blurry' | 'low-contrast'>('searching')

let autoScanActive = false
let liveLoopTimer: ReturnType<typeof setInterval> | null = null
let scanInFlight = false
let previousGrayscale: Uint8Array | null = null

async function ensureOcrReady(): Promise<boolean> {
  scannerError.value = null
  try {
    await prepareOcrWorker()
    ocrReady.value = true
    return true
  } catch (error) {
    ocrReady.value = false
    scannerError.value = error instanceof Error ? error.message : String(error)
    return false
  }
}

async function retryScanner() {
  const ready = await ensureOcrReady()
  if (ready && stream.value && !detected.value) {
    startAutoScan()
  }
}

const guidanceText = computed(() => {
  switch (guidance.value) {
    case 'hold-steady':
      return 'Hold steady…'
    case 'too-blurry':
      return 'Image is blurry — hold steady'
    case 'low-contrast':
      return 'Improve lighting or move closer'
    case 'move-closer':
      return 'Move closer to the price'
    default:
      return 'Point the price at the box'
  }
})

const targetOverlayStyle = {
  width: `${TARGET_WIDTH_RATIO * 100}%`,
  height: `${TARGET_HEIGHT_RATIO * 100}%`,
}

async function startCamera() {
  cameraError.value = null
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    if (videoRef.value) {
      videoRef.value.srcObject = stream.value
      await videoRef.value.play()
    }
    if (!ocrReady.value) {
      await ensureOcrReady()
    }
    if (ocrReady.value && !detected.value) {
      startAutoScan()
    }
  } catch (e) {
    cameraError.value = e instanceof Error ? e.message : String(e)
  }
}

function stopCamera() {
  stopAutoScan()
  stream.value?.getTracks().forEach((track) => track.stop())
  stream.value = null
}

function stopAutoScan() {
  autoScanActive = false
  if (liveLoopTimer) {
    clearInterval(liveLoopTimer)
    liveLoopTimer = null
  }
  previousGrayscale = null
}

function updateGuidanceFromQuality(reason?: 'blur' | 'low-contrast' | 'motion') {
  if (!reason) {
    guidance.value = 'searching'
    return
  }
  if (reason === 'blur') {
    guidance.value = 'too-blurry'
    return
  }
  if (reason === 'low-contrast') {
    guidance.value = 'low-contrast'
    return
  }
  guidance.value = 'hold-steady'
}

function startLiveLoop() {
  if (!autoScanActive || detected.value) return
  liveLoopTimer = setInterval(() => {
    void sampleLiveFrame()
  }, LIVE_SAMPLE_INTERVAL_MS)
}

function startAutoScan() {
  if (autoScanActive || detected.value || !stream.value || !ocrReady.value) return
  autoScanActive = true
  previousGrayscale = null
  void sampleLiveFrame()
  startLiveLoop()
}

async function sampleLiveFrame() {
  if (!autoScanActive || detected.value || !videoRef.value || !canvasRef.value) return

  const crop = captureTargetCrop(videoRef.value, canvasRef.value)
  if (!crop) return

  const grayscale = getGrayscaleFromCanvas(crop)
  if (grayscale.length === 0) return

  const quality = assessFrameQuality(
    grayscale,
    crop.width,
    crop.height,
    previousGrayscale ?? undefined,
  )
  previousGrayscale = grayscale

  if (!quality.acceptable) {
    updateGuidanceFromQuality(quality.reason)
    return
  }

  if (scanInFlight) return
  await runScanCycle()
}

async function recognizePriceFromFrame(): Promise<DetectedPrice | null> {
  if (!videoRef.value || !canvasRef.value) return null

  const crops = capturePreprocessedCrops(videoRef.value, canvasRef.value)
  const result = await runOcrPipeline(crops, editCurrency.value)
  return result.winner?.parsed ?? null
}

async function runScanCycle() {
  if (!videoRef.value || !canvasRef.value || scanInFlight || detected.value) return

  scanInFlight = true
  scanning.value = true
  noPriceFound.value = false

  try {
    const price = await recognizePriceFromFrame()
    const stable = priceTracker.observe(price)

    if (stable) {
      detected.value = true
      editAmount.value = stable.amount
      editCurrency.value = stable.currency
      guidance.value = 'searching'
      stopAutoScan()
      return
    }

    guidance.value = price ? 'hold-steady' : 'move-closer'
  } catch {
    guidance.value = 'move-closer'
  } finally {
    scanInFlight = false
    scanning.value = false
  }
}

async function scanNow() {
  if (!ocrReady.value) {
    const ready = await ensureOcrReady()
    if (!ready) return
  }

  stopAutoScan()
  scanning.value = true
  noPriceFound.value = false

  try {
    const price = await recognizePriceFromFrame()
    if (price) {
      detected.value = true
      editAmount.value = price.amount
      editCurrency.value = price.currency
      priceTracker.reset()
      guidance.value = 'searching'
      stopAutoScan()
      return
    }
    noPriceFound.value = true
    guidance.value = 'move-closer'
  } catch {
    noPriceFound.value = true
    guidance.value = 'move-closer'
  } finally {
    scanning.value = false
    if (!detected.value) {
      startAutoScan()
    }
  }
}

function retry() {
  detected.value = false
  noPriceFound.value = false
  guidance.value = 'searching'
  priceTracker.reset()
  previousGrayscale = null
  startAutoScan()
}

function confirm() {
  if (editAmount.value === null) return
  scanStore.setPending(editAmount.value, editCurrency.value)
  stopCamera()
  router.push('/convert')
}

function handleVisibilityChange() {
  if (document.hidden) {
    stopAutoScan()
    return
  }
  if (stream.value && ocrReady.value && !detected.value) {
    startAutoScan()
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  stopAutoScan()
  stopCamera()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  void terminateOcrWorker()
})
</script>

<template>
  <div class="min-h-screen p-4 pb-28 flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <IconCamera class="h-6 w-6 text-nimiq-blue-light" />
      <h1 class="text-2xl font-bold">Camera Scan</h1>
    </div>
    <p class="text-sm text-nimiq-muted">
      Frames are processed entirely on your device — nothing is uploaded or stored.
    </p>

    <label class="flex items-center justify-between gap-3 rounded-lg bg-nimiq-card border border-nimiq-border p-3">
      <span class="text-sm text-nimiq-muted">Scan currency</span>
      <select
        v-model="editCurrency"
        class="min-h-[44px] rounded-lg bg-nimiq-card-elevated px-3 text-lg cursor-pointer focus:outline-2 focus:outline-nimiq-blue-light"
      >
        <option v-for="c in FIAT_CURRENCIES" :key="c" :value="c">{{ c }}</option>
      </select>
    </label>

    <div
      v-if="scannerError"
      class="flex flex-col gap-3 rounded-lg border border-nimiq-red/30 bg-nimiq-red/10 px-3 py-3 text-sm text-nimiq-red-light"
    >
      <div class="flex items-start gap-2">
        <IconAlert class="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p class="font-medium">Scanner setup needs a retry.</p>
          <p class="mt-1">{{ scannerError }}</p>
          <p class="mt-1 text-nimiq-muted">Check the connection, then retry scanner setup.</p>
        </div>
      </div>
      <button
        type="button"
        class="min-h-[44px] rounded-lg bg-nimiq-card px-4 font-medium text-white transition-colors duration-200 hover:bg-nimiq-card-elevated cursor-pointer"
        @click="retryScanner"
        data-testid="retry-scanner"
      >
        Retry scanner
      </button>
    </div>

    <div v-if="!cameraSupported" class="rounded-lg bg-nimiq-card border border-nimiq-border p-4 text-nimiq-muted">
      <template v-if="insecureContext">
        Camera access requires HTTPS on mobile. Reopen NimLens from a secure HTTPS URL.
      </template>
      <template v-else>
        Camera access isn't available on this device or browser.
      </template>
    </div>

    <template v-else>
      <div
        v-if="cameraError"
        class="flex items-center gap-2 rounded-lg border border-nimiq-red/30 bg-nimiq-red/10 px-3 py-2 text-sm text-nimiq-red-light"
      >
        <IconAlert class="h-4 w-4 shrink-0" />
        Camera access failed: {{ cameraError }}
      </div>
      <div class="relative">
        <video ref="videoRef" class="w-full rounded-xl bg-black aspect-video object-cover" muted playsinline></video>
        <div
          v-if="stream && !detected"
          class="absolute inset-0 flex items-center justify-center pointer-events-none"
          aria-hidden="true"
        >
          <div
            class="rounded-lg border-2 border-dashed border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            :style="targetOverlayStyle"
          ></div>
        </div>
        <p
          v-if="stream && ocrReady && !detected"
          class="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-sm text-white"
        >
          {{ guidanceText }}
        </p>
      </div>
      <canvas ref="canvasRef" class="hidden"></canvas>

      <button
        v-if="!stream"
        type="button"
        class="min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-nimiq-blue-light px-4 font-medium text-nimiq-darkerblue transition-colors duration-200 hover:brightness-110 cursor-pointer"
        @click="startCamera"
        data-testid="start-camera"
      >
        <IconCamera class="h-5 w-5" />
        Start camera
      </button>
      <p v-else-if="stream && !ocrReady" class="text-sm text-nimiq-muted">
        Preparing scanner…
      </p>

      <button
        v-else-if="stream && !detected"
        type="button"
        :disabled="scanning"
        class="min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-nimiq-blue-light px-4 font-medium text-nimiq-darkerblue transition-colors duration-200 hover:brightness-110 disabled:opacity-50 cursor-pointer"
        @click="scanNow"
        data-testid="scan-now"
      >
        {{ scanning ? 'Scanning…' : 'Scan now' }}
      </button>

      <div
        v-if="noPriceFound"
        class="flex items-center gap-2 rounded-lg border border-nimiq-gold/30 bg-nimiq-gold/10 px-3 py-2 text-sm text-nimiq-gold-light"
      >
        <IconAlert class="h-4 w-4 shrink-0" />
        No price found — try again, or enter the price manually below.
      </div>

      <div v-if="detected" class="rounded-xl border border-nimiq-border bg-nimiq-card p-4 flex flex-col gap-3">
        <div class="flex items-center gap-2 text-nimiq-muted">
          <IconCheck class="h-4 w-4 shrink-0 text-nimiq-green-light" />
          Detected: {{ editAmount }} {{ editCurrency }} — is this correct?
        </div>
        <div class="flex gap-2">
          <input
            v-model.number="editAmount"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.01"
            class="min-w-0 flex-1 min-h-[44px] rounded-lg bg-nimiq-card-elevated px-3 text-xl focus:outline-2 focus:outline-nimiq-blue-light"
          />
          <select
            v-model="editCurrency"
            class="w-24 shrink-0 min-h-[44px] rounded-lg bg-nimiq-card-elevated px-3 text-xl cursor-pointer focus:outline-2 focus:outline-nimiq-blue-light"
          >
            <option v-for="c in FIAT_CURRENCIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <button
          type="button"
          class="min-h-[44px] rounded-lg bg-nimiq-green-light px-4 font-medium text-nimiq-darkerblue transition-colors duration-200 hover:brightness-110 cursor-pointer"
          @click="confirm"
        >
          Confirm
        </button>
        <button
          type="button"
          class="min-h-[44px] rounded-lg bg-nimiq-card-elevated px-4 font-medium transition-colors duration-200 hover:bg-white/10 cursor-pointer"
          @click="retry"
          data-testid="retry"
        >
          Try again
        </button>
      </div>
    </template>

    <router-link
      to="/convert"
      class="min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-nimiq-card border border-nimiq-border px-4 py-3 font-medium text-center transition-colors duration-200 hover:bg-nimiq-card-elevated cursor-pointer"
    >
      <IconExchange class="h-4 w-4 text-nimiq-blue-light" />
      Enter price manually
    </router-link>
  </div>
</template>
