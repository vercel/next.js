import {
  compare as compareVersions,
  intersects as rangesIntersect,
  major,
} from 'semver'

export function eslintSpecifierSatisfiesPeer(
  currentSpecifier: string,
  peerRange: string
): boolean {
  try {
    return rangesIntersect(currentSpecifier, peerRange, {
      includePrerelease: true,
    })
  } catch {
    return true
  }
}

export function resolveEslintUpgradeVersion(
  currentSpecifier: string,
  peerRange: string,
  versionsMatchingPeer: string[]
): string | null {
  if (eslintSpecifierSatisfiesPeer(currentSpecifier, peerRange)) {
    return null
  }

  if (versionsMatchingPeer.length === 0) {
    return null
  }

  const sorted = [...versionsMatchingPeer].sort(compareVersions)
  const lowestMajor = major(sorted[0])
  const inLowestMajor = sorted.filter(
    (version) => major(version) === lowestMajor
  )
  return inLowestMajor[inLowestMajor.length - 1]
}
