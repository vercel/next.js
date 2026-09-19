import type { NextConfigComplete } from '../../server/config-shared'
import semver from 'next/dist/compiled/semver'

export type UpgradeDocument = `docs/${string}.md` | `skills/${string}/SKILL.md`

export type FutureDefaultsConfig = Pick<NextConfigComplete, 'cacheComponents'>

type FutureDefault = {
  name: string
  availableSince: string
  isAdopted(config: FutureDefaultsConfig): boolean
  adoptionDoc: readonly UpgradeDocument[]
  optimizationDoc: readonly UpgradeDocument[]
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
  },
] as const satisfies readonly FutureDefault[]

export type FutureDefaultEntry = (typeof futureDefaults)[number]

export function getPendingFutureDefaults(
  config: FutureDefaultsConfig,
  installedVersion: string
) {
  if (!semver.valid(installedVersion) || semver.prerelease(installedVersion)) {
    return []
  }
  return futureDefaults.filter(
    (entry) =>
      semver.gte(installedVersion, entry.availableSince) &&
      !entry.isAdopted(config)
  )
}
