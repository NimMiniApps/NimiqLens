import { beforeEach, describe, expect, it, vi } from 'vitest'
import { init } from '@nimiq/mini-app-sdk'
import { initNimiq, formatProviderError, providerResult } from './nimiq'

vi.mock('@nimiq/mini-app-sdk', () => ({
  init: vi.fn(),
}))

describe('initNimiq', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses a short provider detection timeout so app startup is not blocked', async () => {
    vi.mocked(init).mockRejectedValueOnce(new Error('provider unavailable'))

    await initNimiq()

    expect(init).toHaveBeenCalledWith({ timeout: 750 })
  })
})

describe('formatProviderError', () => {
  it('maps permission denied responses to a friendly message', () => {
    expect(formatProviderError({
      error: { type: 'PermissionDeniedError', message: { code: 4001 } },
    })).toBe('Transaction cancelled.')
  })

  it('stringifies nested error messages', () => {
    expect(formatProviderError({
      error: { type: 'InvalidTransactionError', message: { message: 'Insufficient balance' } },
    })).toBe('Insufficient balance')
  })
})

describe('providerResult', () => {
  it('throws formatted errors from provider responses', () => {
    expect(() => providerResult({
      error: { type: 'PermissionDeniedError', message: 'User rejected' },
    })).toThrow('Transaction cancelled.')
  })
})
