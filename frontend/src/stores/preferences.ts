import { defineStore } from 'pinia'
import { FIAT_CURRENCIES, type FiatCurrency } from '../lib/convert'

const STORAGE_KEY = 'nimlens_preferences'

export const PREFERENCES_STORAGE_KEY = STORAGE_KEY

interface StoredPreferences {
  fiatCurrency: FiatCurrency
  onboardingComplete: boolean
}

function readStored(): StoredPreferences | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredPreferences>
    if (!parsed.fiatCurrency || !FIAT_CURRENCIES.includes(parsed.fiatCurrency)) return null
    return { fiatCurrency: parsed.fiatCurrency, onboardingComplete: parsed.onboardingComplete === true }
  } catch {
    return null
  }
}

function writeStored(prefs: StoredPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Storage may be unavailable in some WebViews.
  }
}

export const usePreferencesStore = defineStore('preferences', {
  state: () => {
    const stored = readStored()
    return {
      fiatCurrency: stored?.fiatCurrency ?? ('EUR' as FiatCurrency),
      onboardingComplete: stored?.onboardingComplete ?? false,
    }
  },
  actions: {
    setFiatCurrency(currency: FiatCurrency) {
      this.fiatCurrency = currency
      writeStored({ fiatCurrency: this.fiatCurrency, onboardingComplete: this.onboardingComplete })
    },
    completeOnboarding(currency: FiatCurrency) {
      this.fiatCurrency = currency
      this.onboardingComplete = true
      writeStored({ fiatCurrency: this.fiatCurrency, onboardingComplete: this.onboardingComplete })
    },
  },
})
