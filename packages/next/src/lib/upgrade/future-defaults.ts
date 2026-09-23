import semver from 'next/dist/compiled/semver'
import { createValidFileMatcher } from '../../server/lib/find-page-file'
import { findPagesDir } from '../find-pages-dir'
import {
  collectAppFiles,
  collectPagesFiles,
  getPageFromPath,
  isRenderablePagesRoute,
} from '../route-files'
import type { NextConfigComplete } from '../../server/config-shared'

export type UpgradeDocument = `docs/${string}.md` | `skills/${string}/SKILL.md`

type FutureDefault = {
  name: string
  availableSince: string
  isAdopted(config: NextConfigComplete, hasPagesUi: boolean): boolean
  adoptionDoc: readonly UpgradeDocument[]
  optimizationDoc: readonly UpgradeDocument[]
}

export const futureDefaults = [
  {
    name: 'App Router',
    availableSince: '13.4.0',
    isAdopted: (_config, hasPagesUi) => !hasPagesUi,
    adoptionDoc: ['docs/01-app/02-guides/migrating/app-router-migration.md'],
    optimizationDoc: [],
  },
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
  {
    name: 'Partial Prefetching',
    availableSince: '16.3.0',
    isAdopted: (config) => config.partialPrefetching === true,
    adoptionDoc: [
      'docs/01-app/02-guides/adopting-partial-prefetching.md',
      'skills/next-partial-prefetching-adoption/SKILL.md',
    ],
    optimizationDoc: ['skills/next-partial-prefetching-optimizer/SKILL.md'],
  },
] as const satisfies readonly FutureDefault[]

export type FutureDefaultEntry = (typeof futureDefaults)[number]

export async function getPendingFutureDefaults(
  directory: string,
  config: NextConfigComplete,
  version: string
): Promise<FutureDefaultEntry[]> {
  const { appDir, pagesDir } = findPagesDir(directory)
  const matcher = createValidFileMatcher(config.pageExtensions, appDir)
  const pagesFiles = pagesDir ? await collectPagesFiles(pagesDir, matcher) : []
  const hasPagesUi = pagesFiles.some((file) => {
    if (file.endsWith('.d.ts') && config.pageExtensions.includes('ts')) {
      return false
    }
    return isRenderablePagesRoute(getPageFromPath(file, config.pageExtensions))
  })

  // A Pages UI migration supplies the App Router prerequisite for later defaults.
  // API-only apps have no UI to migrate or cache.
  if (!hasPagesUi) {
    const appFiles = appDir
      ? (await collectAppFiles(appDir, matcher)).appPaths
      : []
    const hasAppUi = appFiles.some(
      (file) => !matcher.isAppRouterRoute(file) && !matcher.isMetadataFile(file)
    )
    if (!hasAppUi) {
      return []
    }
  }

  return futureDefaults.filter(
    (entry) =>
      semver.gte(version, entry.availableSince) &&
      !entry.isAdopted(config, hasPagesUi)
  )
}
