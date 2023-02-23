import * as semver from 'next/dist/compiled/semver'

export interface VersionInfo {
  installed: string
  staleness:
    | 'fresh'
    | 'stale-patch'
    | 'stale-minor'
    | 'stale-major'
    | 'stale-prerelease'
    | 'newer-than-npm'
    | 'unknown'
  expected?: string
}

export function parseVersionInfo(o: {
  installed: string
  latest: string
  canary: string
}): VersionInfo {
  const latest = semver.parse(o.latest)
  const canary = semver.parse(o.canary)
  const installedParsed = semver.parse(o.installed)
  const installed = o.installed
  if (installedParsed && latest && canary) {
    if (installedParsed.major < latest.major) {
      // Old major version
      return { staleness: 'stale-major', expected: latest.raw, installed }
    } else if (
      installedParsed.prerelease[0] === 'canary' &&
      semver.lt(installedParsed, canary)
    ) {
      // Matching major, but old canary
      return {
        staleness: 'stale-prerelease',
        expected: canary.raw,
        installed,
      }
    } else if (
      !installedParsed.prerelease.length &&
      semver.lt(installedParsed, latest)
    ) {
      // Stable, but not the latest
      if (installedParsed.minor === latest.minor) {
        // Same major and minor, but not the latest patch
        return {
          staleness: 'stale-patch',
          expected: latest.raw,
          installed,
        }
      }
      return { staleness: 'stale-minor', expected: latest.raw, installed }
    } else if (
      semver.gt(installedParsed, latest) &&
      installedParsed.version !== canary.version
    ) {
      // Newer major version
      return { staleness: 'newer-than-npm', installed }
    } else {
      // Latest and greatest
      return { staleness: 'fresh', installed }
    }
  }

  return {
    installed: installedParsed?.raw ?? '0.0.0',
    staleness: 'unknown',
  }
}
