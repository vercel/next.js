import type { NextConfigComplete } from '../../server/config-shared'
import semver from 'next/dist/compiled/semver'
import { findDir } from '../find-pages-dir'

export type UpgradeDocument =
  | `docs/${string}.md`
  | `agent-docs/adoption/${string}/guide.md`

type FutureDefault = {
  name: string
  availableSince: string
  isAdopted(config: Pick<NextConfigComplete, 'cacheComponents'>): boolean
  adoptionDoc: readonly UpgradeDocument[]
  optimizationSkills: readonly string[]
  isApplicable(directory: string): boolean
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
      'agent-docs/adoption/cache-components/guide.md',
    ],
    optimizationSkills: ['next-cache-components-optimizer'],
    // TODO: Support Pages -> App migration before offering adoption to Pages-only apps.
    isApplicable: (directory) => findDir(directory, 'app') !== null,
  },
] as const satisfies readonly FutureDefault[]

export type FutureDefaultEntry = (typeof futureDefaults)[number]

export function getPendingFutureDefaults(
  directory: string,
  config: Pick<NextConfigComplete, 'cacheComponents'>,
  version: string
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
      entry.isApplicable(directory)
  )
}
