import { describe, expect, it, vi } from 'vitest'
import { fetchDeployedVersion, isUpdateAvailable } from './versionUpdate'
import { getFrontendVersion } from './version'

describe('versionUpdate', () => {
  it('detects when a newer commit is deployed', () => {
    const deployed = getFrontendVersion('bbbbbbb00000000000000000000000000000000', '2026-06-27T00:00:00Z')
    expect(isUpdateAvailable(deployed)).toBe(true)
  })

  it('ignores matching commits and dev builds', () => {
    const current = getFrontendVersion()
    expect(isUpdateAvailable(current)).toBe(false)
    expect(isUpdateAvailable(getFrontendVersion('dev', 'unknown'))).toBe(false)
  })

  it('loads deployed version metadata from version.json', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        commitHash: 'ccccccc00000000000000000000000000000000',
        buildTime: '2026-06-27T12:00:00Z',
      }),
    }))

    await expect(fetchDeployedVersion()).resolves.toMatchObject({
      commitHash: 'ccccccc00000000000000000000000000000000',
      shortCommit: 'ccccccc',
      buildTime: '2026-06-27T12:00:00Z',
    })
  })
})
