import semver from 'semver'
import { existsSync } from 'fs'
import { join } from 'path'

export type AgentUpgradePolicy = 'security' | 'latest' | 'experimental-future'
export type UpgradeConfig = { cacheComponents: boolean | undefined }

export type UpgradeDocument = `docs/${string}.md` | `skills/${string}/SKILL.md`

type FutureDefault = {
  name: string
  availableSince: string
  isAdopted(config: UpgradeConfig): boolean
  adoptionDoc: readonly UpgradeDocument[]
  optimizationDoc: readonly UpgradeDocument[]
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
      'skills/next-cache-components-adoption/SKILL.md',
    ],
    optimizationDoc: ['skills/next-cache-components-optimizer/SKILL.md'],
    // TODO: Support Pages -> App migration before offering adoption to Pages-only apps.
    isApplicable: (directory) =>
      existsSync(join(directory, 'app')) ||
      existsSync(join(directory, 'src', 'app')),
  },
] as const satisfies readonly FutureDefault[]

export type FutureDefaultEntry = (typeof futureDefaults)[number]

export function getPendingFutureDefaults(
  directory: string,
  config: UpgradeConfig,
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
