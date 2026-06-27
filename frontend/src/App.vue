<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePreferencesStore } from './stores/preferences'
import IconHexagonOutline from './components/icons/IconHexagonOutline.vue'
import IconExchange from './components/icons/IconExchange.vue'
import IconQr from './components/icons/IconQr.vue'
import IconChart from './components/icons/IconChart.vue'
import IconInfo from './components/icons/IconInfo.vue'
import UpdateBanner from './components/UpdateBanner.vue'

const route = useRoute()
const router = useRouter()
const preferencesStore = usePreferencesStore()

onMounted(() => {
  if (!preferencesStore.onboardingComplete && route.name !== 'onboarding') {
    router.replace('/onboarding')
  }
})

const showNav = computed(() => route.name !== 'onboarding')

const navItems = [
  { to: '/', label: 'Home', icon: IconHexagonOutline },
  { to: '/convert', label: 'Convert', icon: IconExchange },
  { to: '/scan', label: 'Scan', icon: IconQr },
  { to: '/rates', label: 'Rates', icon: IconChart },
  { to: '/about', label: 'About', icon: IconInfo },
]
</script>

<template>
  <div class="min-h-screen bg-nimiq-darkerblue text-white">
    <UpdateBanner />
    <router-view />
    <nav
      v-if="showNav"
      class="fixed inset-x-4 bottom-4 flex rounded-2xl border border-white/10 bg-nimiq-card/90 backdrop-blur-lg shadow-lg shadow-black/30"
    >
      <router-link
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="group flex flex-1 flex-col items-center gap-1 py-2.5 min-h-[44px] text-xs font-medium text-nimiq-muted transition-colors duration-200 first:rounded-l-2xl last:rounded-r-2xl active:bg-white/5 cursor-pointer"
        active-class="text-nimiq-blue-light"
      >
        <component :is="item.icon" class="h-5 w-5" />
        {{ item.label }}
      </router-link>
    </nav>
  </div>
</template>
