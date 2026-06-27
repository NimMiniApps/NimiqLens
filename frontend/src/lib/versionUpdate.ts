import { getFrontendVersion, type FrontendVersion } from './version'

interface DeployedVersionPayload {
  commitHash?: string
  buildTime?: string
}

export async function fetchDeployedVersion(): Promise<FrontendVersion | null> {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  try {
    const res = await fetch(`${base}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const payload = await res.json() as DeployedVersionPayload
    if (typeof payload.commitHash !== 'string') return null
    return getFrontendVersion(payload.commitHash, payload.buildTime ?? 'unknown')
  } catch {
    return null
  }
}

export function isUpdateAvailable(deployed: FrontendVersion): boolean {
  const current = getFrontendVersion()
  if (deployed.commitHash === 'dev' || current.commitHash === 'dev') return false
  return deployed.commitHash !== current.commitHash
}

export function reloadForUpdate(): void {
  window.location.reload()
}
