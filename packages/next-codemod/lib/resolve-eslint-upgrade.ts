import { compare as compareVersions } from 'semver'

export function resolveEslintUpgradeVersion(
  _currentSpecifier: string,
  _peerRange: string,
  versionsMatchingPeer: string[]
): string | null {
  if (versionsMatchingPeer.length === 0) {
    return null
  }
  const sorted = [...versionsMatchingPeer].sort(compareVersions)
  return sorted[sorted.length - 1]
}
