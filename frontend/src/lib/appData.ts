import { PREFERENCES_STORAGE_KEY } from '../stores/preferences'

const PRESERVED_LOCAL_STORAGE_KEYS = new Set([PREFERENCES_STORAGE_KEY])

function clearLocalStorageExceptPreserved(): void {
  const preserved = new Map<string, string>()
  for (const key of PRESERVED_LOCAL_STORAGE_KEYS) {
    const value = localStorage.getItem(key)
    if (value !== null) preserved.set(key, value)
  }

  try {
    localStorage.clear()
    for (const [key, value] of preserved) {
      localStorage.setItem(key, value)
    }
  } catch {
    // Storage can be unavailable in restricted WebViews.
  }
}

async function clearCacheStorage(): Promise<void> {
  if (!('caches' in window)) return
  const keys = await caches.keys()
  await Promise.all(keys.map((key) => caches.delete(key)))
}

async function clearServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map((registration) => registration.unregister()))
}

async function clearIndexedDB(): Promise<void> {
  if (!('indexedDB' in window) || typeof indexedDB.databases !== 'function') return
  const databases = await indexedDB.databases()
  await Promise.all(databases
    .map((database) => database.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .map((name) => new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })))
}

export async function purgeLocalAppData(reload = true): Promise<void> {
  const cleanup = [
    clearCacheStorage(),
    clearServiceWorkers(),
    clearIndexedDB(),
  ]

  clearLocalStorageExceptPreserved()

  try {
    sessionStorage.clear()
  } catch {
    // Storage can be unavailable in restricted WebViews.
  }

  await Promise.allSettled(cleanup)

  if (reload) window.location.reload()
}
