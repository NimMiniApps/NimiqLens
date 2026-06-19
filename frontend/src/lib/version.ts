declare const __APP_COMMIT_HASH__: string
declare const __APP_BUILD_TIME__: string

export interface FrontendVersion {
  commitHash: string
  shortCommit: string
  buildTime: string
}

export function getFrontendVersion(
  commitHash = __APP_COMMIT_HASH__,
  buildTime = __APP_BUILD_TIME__,
): FrontendVersion {
  const normalizedCommit = commitHash || 'dev'
  return {
    commitHash: normalizedCommit,
    shortCommit: normalizedCommit.slice(0, 7),
    buildTime: buildTime || 'unknown',
  }
}
