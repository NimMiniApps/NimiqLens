<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { fetchDeployedVersion, isUpdateAvailable, reloadForUpdate } from '../lib/versionUpdate'
import { getFrontendVersion } from '../lib/version'
import IconRefresh from './icons/IconRefresh.vue'

const updateAvailable = ref(false)
const checking = ref(false)

let intervalId: ReturnType<typeof setInterval> | undefined

async function checkForUpdate() {
  if (checking.value) return
  checking.value = true
  try {
    const deployed = await fetchDeployedVersion()
    updateAvailable.value = deployed ? isUpdateAvailable(deployed) : false
  } finally {
    checking.value = false
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void checkForUpdate()
  }
}

onMounted(() => {
  void checkForUpdate()
  intervalId = setInterval(() => void checkForUpdate(), 5 * 60_000)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

const currentShort = getFrontendVersion().shortCommit
</script>

<template>
  <div
    v-if="updateAvailable"
    class="fixed inset-x-0 top-0 z-50 border-b border-nimiq-blue-light/40 bg-nimiq-darkerblue/95 px-4 py-3 backdrop-blur-md"
  >
    <div class="mx-auto flex max-w-lg items-center justify-between gap-3">
      <p class="text-sm">
        A newer NimLens build is available
        <span class="text-nimiq-muted">(you have {{ currentShort }})</span>
      </p>
      <button
        type="button"
        class="flex shrink-0 items-center gap-1.5 rounded-lg bg-nimiq-blue-light px-3 py-2 text-sm font-medium text-nimiq-darkerblue transition-colors duration-200 hover:brightness-110 cursor-pointer"
        @click="reloadForUpdate()"
      >
        <IconRefresh class="h-4 w-4" />
        Reload
      </button>
    </div>
  </div>
</template>
