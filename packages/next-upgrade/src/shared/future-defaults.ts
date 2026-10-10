import semver from 'next/dist/compiled/semver'

// Upgrade decisions only need the adopted flag and the caller's app lookup.
export type FutureDefaultsConfig = { cacheComponents: boolean }

export type FindAppDirectory = (directory: string, name: 'app') => string | null

export type UpgradeDocument = `docs/${string}.md` | `skills/${string}/SKILL.md`

type FutureDefault = {
  name: string
  availableSince: string
  isAdopted(config: FutureDefaultsConfig): boolean
  adoptionDoc: readonly UpgradeDocument[]
  optimizationDoc: readonly UpgradeDocument[]
  isApplicable(directory: string, findDir: FindAppDirectory): boolean
}

export const futureDefaults = [
  // TODO: Add `partialPrefetching` after the Cache Components Future Default
  // workflow is proven end to end.
  {
    name: 'Cache Components',
    availableSince: '16.3.0',
    isAdopted: (config) => config.cacheComponents === true,
    adoptionDoc: [
      'docs/01-app/02-guides/migrating-to-cache-components.md',
      'skills/next-cache-components-adoption/SKILL.md',
    ],
    optimizationDoc: ['skills/next-cache-components-optimizer/SKILL.md'],
    // TODO: Support Pages -> App migration before offering adoption to Pages-only apps.
    isApplicable: (directory, findDir) => findDir(directory, 'app') !== null,
  },
] as const satisfies readonly FutureDefault[]

export type FutureDefaultEntry = (typeof futureDefaults)[number]

export function getPendingFutureDefaults(
  directory: string,
  config: FutureDefaultsConfig,
  version: string,
  findDir: FindAppDirectory
) {
  if (
    !semver.valid(version) ||
    (semver.prerelease(version) && semver.prerelease(version)?.[0] !== 'canary')
  ) {
    return []
  }
  return futureDefaults.filter(
    (entry) =>
      semver.gte(version, entry.availableSince) &&
      !entry.isAdopted(config) &&
      entry.isApplicable(directory, findDir)
  )
}
