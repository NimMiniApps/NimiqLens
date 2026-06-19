import { describe, expect, it } from 'vitest'
import { getFrontendVersion } from './version'

describe('getFrontendVersion', () => {
  it('returns commit metadata with a short commit', () => {
    const version = getFrontendVersion('abcdef123456', '2026-06-20T00:00:00Z')

    expect(version.commitHash).toBe('abcdef123456')
    expect(version.shortCommit).toBe('abcdef1')
    expect(version.buildTime).toBe('2026-06-20T00:00:00Z')
  })
})
