import { createRouter, createWebHistory } from 'vue-router'

export const routes = [
  { path: '/', name: 'welcome', component: () => import('../views/WelcomeView.vue') },
  { path: '/convert', name: 'convert', component: () => import('../views/ConverterView.vue') },
  { path: '/scan', name: 'scan', component: () => import('../views/ScanView.vue') },
  { path: '/rates', name: 'rates', component: () => import('../views/RatesView.vue') },
  { path: '/about', name: 'about', component: () => import('../views/AboutView.vue') },
  { path: '/onboarding', name: 'onboarding', component: () => import('../views/OnboardingView.vue') },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})
