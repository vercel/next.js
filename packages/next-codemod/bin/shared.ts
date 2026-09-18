import { minVersion, satisfies, major } from 'semver'

export class BadInput extends Error {}

/**
 * Decide what `upgrade` should do with the project's `eslint` specifier given
 * the `eslint` peer range of the target `eslint-config-next` version.
 *
 * Returns null when the existing specifier should be left untouched:
 * - it already satisfies the peer range. The project may deliberately track an
 *   older major (e.g. eslint plugins that do not support the newest eslint
 *   release yet), so we must not pin them onto a newer major unprompted.
 * - it is not something we can interpret as a semver range (e.g. `latest`, a
 *   workspace or npm alias).
 *
 * Otherwise resolves the highest release of the lowest major satisfying the
 * peer range (e.g. `eslint@^9.0.0` for a `>=9` peer), so a project below the
 * range lands on the closest satisfying major instead of the newest eslint
 * release. Returns the resolved version, or null if resolution fails.
 */
export async function resolveEslintUpgradeTarget(
  installedEslintSpecifier: string,
  eslintPeerRange: string,
  resolveHighestVersion: (query: string) => Promise<string>
): Promise<string | null> {
  let peerMinimum
  try {
    peerMinimum = minVersion(eslintPeerRange)
  } catch {
    return null
  }
  if (!peerMinimum) {
    return null
  }

  let installedSatisfiesPeer: boolean
  try {
    const installedMinimum = minVersion(installedEslintSpecifier)
    if (!installedMinimum) {
      return null
    }
    installedSatisfiesPeer = satisfies(
      installedMinimum.version,
      eslintPeerRange
    )
  } catch {
    return null
  }

  if (installedSatisfiesPeer) {
    return null
  }

  return resolveHighestVersion(
    `eslint@^${major(peerMinimum.version)}.0.0`
  )
}
