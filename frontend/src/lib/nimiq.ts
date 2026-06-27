interface ProviderErrorResponse {
  error: {
    type: string
    message: string
  }
}

type InitFn = (options: { timeout: number }) => Promise<unknown>
export type NimiqProvider = NonNullable<Awaited<ReturnType<typeof initNimiq>>>

let provider: NimiqProvider | null = null
let standalone = false
let sdkPromise: Promise<{ init: InitFn }> | null = null

function loadSdk(): Promise<{ init: InitFn }> {
  if (!sdkPromise) {
    sdkPromise = import('@nimiq/mini-app-sdk')
  }
  return sdkPromise
}

export function isStandalone(): boolean {
  return standalone
}

export function providerResult<T>(result: T | ProviderErrorResponse): T {
  if (typeof result === 'object' && result !== null && 'error' in result) {
    throw new Error(result.error.message)
  }
  return result
}

/**
 * Initializes the Nimiq Pay provider. Returns null (instead of throwing) when
 * the app is not running inside Nimiq Pay or initialization times out, so the
 * app can fall back to a non-wallet experience.
 */
export async function initNimiq(timeout = 750): Promise<NimiqProvider | null> {
  if (provider) return provider
  try {
    const { init } = await loadSdk()
    provider = (await init({ timeout })) as NimiqProvider
    standalone = false
    return provider
  } catch {
    standalone = true
    provider = null
    return null
  }
}
