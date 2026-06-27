import type { ErrorResponse, NimiqProvider } from '@nimiq/mini-app-sdk'

export type { NimiqProvider }

type InitFn = (options: { timeout: number }) => Promise<NimiqProvider>

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

const PERMISSION_DENIED_ERROR = 'PermissionDeniedError'

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.message === 'string') return record.message
    if (typeof record.type === 'string') return record.type
  }
  if (value == null) return 'Unknown error'
  return String(value)
}

export function formatProviderError(error: unknown): string {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null && 'error' in error) {
    const response = error as ErrorResponse
    if (response.error.type === PERMISSION_DENIED_ERROR) {
      return 'Transaction cancelled.'
    }
    const message = stringifyUnknown(response.error.message)
    return message || response.error.type || 'Transaction failed.'
  }

  return stringifyUnknown(error)
}

export function providerResult<T>(result: T | ErrorResponse): T {
  if (typeof result === 'object' && result !== null && 'error' in result) {
    throw new Error(formatProviderError(result))
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
    provider = await init({ timeout })
    standalone = false
    return provider
  } catch {
    standalone = true
    provider = null
    return null
  }
}
