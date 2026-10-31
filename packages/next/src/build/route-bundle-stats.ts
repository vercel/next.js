import path from 'path'
import { promises as fs, statSync } from 'fs'
import {
  APP_PATHS_MANIFEST,
  CLIENT_REFERENCE_MANIFEST,
  SERVER_DIRECTORY,
} from '../shared/lib/constants'
import type { BuildManifest } from '../server/get-page-files'
import { filterAndSortList } from './utils'

const ROUTE_BUNDLE_STATS_FILE = 'route-bundle-stats.json'

type RouteBundleStat = {
  route: string
  firstLoadUncompressedJsBytes: number
  firstLoadChunkPaths: string[]
}

function sumFileSizes(
  distDir: string,
  files: string[],
  cache: Map<string, number>
): number {
  let total = 0
  for (const relPath of files) {
    const cached = cache.get(relPath)
    if (cached !== undefined) {
      total += cached
      continue
    }
    try {
      const size = statSync(path.join(distDir, relPath)).size
      cache.set(relPath, size)
      total += size
    } catch {
      // ignore missing files
    }
  }
  return total
}

function toProjectRelativePaths(
  dir: string,
  distDir: string,
  relPaths: string[]
): string[] {
  return relPaths.map((f) => path.relative(dir, path.join(distDir, f)))
}

function buildRouteToAppPathsMap(
  appPathsManifest: Record<string, string>
): Map<string, string[]> {
  const { normalizeAppPath } =
    require('../shared/lib/router/utils/app-paths') as typeof import('../shared/lib/router/utils/app-paths')
  // Keys in appPathsManifest are app paths like /blog/[slug]/page;
  // values are server bundle file paths. Normalize the key to get the route.
  const routeToAppPaths = new Map<string, string[]>()
  for (const appPath of Object.keys(appPathsManifest)) {
    const route = normalizeAppPath(appPath)
    const existing = routeToAppPaths.get(route)
    if (existing) {
      existing.push(appPath)
    } else {
      routeToAppPaths.set(route, [appPath])
    }
  }
  return routeToAppPaths
}

// Reads the manfiest file and gets the entry JS files. The manifest file is
// a JavaScript file that sets a global variable (__RSC_MANIFEST). We require()
// it with a save/restore of the global
function readEntryJSFiles(
  distDir: string,
  pagePath: string,
  appRoute: string
): Record<string, string[]> | undefined {
  const manifestFile = path.join(
    distDir,
    SERVER_DIRECTORY,
    'app',
    `${pagePath}_${CLIENT_REFERENCE_MANIFEST}.js`
  )
  try {
    const g = global as Record<string, unknown>
    const prev = g.__RSC_MANIFEST
    g.__RSC_MANIFEST = undefined
    require(manifestFile)
    const rscManifest = g.__RSC_MANIFEST as
      | Record<string, { entryJSFiles?: Record<string, string[]> }>
      | undefined
    g.__RSC_MANIFEST = prev

    // The key in __RSC_MANIFEST is the app path (e.g. /blog/[slug]/page)
    const manifestEntry = rscManifest?.[pagePath] ?? rscManifest?.[appRoute]
    return manifestEntry?.entryJSFiles
  } catch {
    return undefined
  }
}

function collectPagesRouterStats(
  pages: ReadonlyArray<string>,
  buildManifest: BuildManifest,
  distDir: string,
  dir: string,
  cache: Map<string, number>
): RouteBundleStat[] {
  const rows: RouteBundleStat[] = []
  const sharedFiles = buildManifest.pages['/_app'] ?? []
  for (const page of filterAndSortList(pages, 'pages', false)) {
    if (page === '/_app' || page === '/_document' || page === '/_error')
      // Don't report on layouts directly
      continue

    const allFiles = (buildManifest.pages[page] ?? []).filter((f) =>
      f.endsWith('.js')
    )
    const sharedJs = sharedFiles.filter((f) => f.endsWith('.js'))
    const chunks = [...new Set([...allFiles, ...sharedJs])]
    const firstLoadUncompressedJsBytes = sumFileSizes(distDir, chunks, cache)
    rows.push({
      route: page,
      firstLoadUncompressedJsBytes,
      firstLoadChunkPaths: toProjectRelativePaths(dir, distDir, chunks),
    })
  }
  return rows
}

async function collectAppRouterStats(
  appRoutes: ReadonlyArray<string>,
  buildManifest: BuildManifest,
  distDir: string,
  dir: string,
  cache: Map<string, number>
): Promise<RouteBundleStat[]> {
  let appPathsManifest: Record<string, string> = {}
  try {
    const manifestPath = path.join(
      distDir,
      SERVER_DIRECTORY,
      APP_PATHS_MANIFEST
    )
    appPathsManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  } catch {
    // App paths manifest not available; skip app router sizes
    return []
  }

  const routeToAppPaths = buildRouteToAppPathsMap(appPathsManifest)
  const sharedFiles = buildManifest.rootMainFiles ?? []
  const rows: RouteBundleStat[] = []

  for (const appRoute of filterAndSortList(appRoutes, 'app', false)) {
    const appPaths = routeToAppPaths.get(appRoute) ?? []
    // Find the /page entry (most specific, has the most chunks)
    const pagePath = appPaths.find((p) => p.endsWith('/page'))
    if (!pagePath) continue

    const entryJSFiles = readEntryJSFiles(distDir, pagePath, appRoute)
    if (!entryJSFiles) continue

    // Union JS files across all segments (page, layout, etc.) so that
    // layout code's contribution is included in the First Load JS total.
    const allFiles = [
      ...new Set(
        Object.values(entryJSFiles)
          .flat()
          .filter((f) => f.endsWith('.js'))
      ),
    ]
    const sharedJs = sharedFiles.filter((f) => f.endsWith('.js'))
    const chunks = [...new Set([...allFiles, ...sharedJs])]
    const firstLoadUncompressedJsBytes = sumFileSizes(distDir, chunks, cache)
    rows.push({
      route: appRoute,
      firstLoadUncompressedJsBytes,
      firstLoadChunkPaths: toProjectRelativePaths(dir, distDir, chunks),
    })
  }
  return rows
}

export async function writeRouteBundleStats(
  lists: {
    pages: ReadonlyArray<string>
    app: ReadonlyArray<string> | undefined
  },
  buildManifest: BuildManifest,
  distDir: string,
  dir: string
): Promise<void> {
  const cache = new Map<string, number>()

  const rows = [
    ...(lists.pages.length > 0
      ? collectPagesRouterStats(lists.pages, buildManifest, distDir, dir, cache)
      : []),
    ...(lists.app && lists.app.length > 0
      ? await collectAppRouterStats(
          lists.app,
          buildManifest,
          distDir,
          dir,
          cache
        )
      : []),
  ]

  rows.sort(
    (a, b) => b.firstLoadUncompressedJsBytes - a.firstLoadUncompressedJsBytes
  )

  const diagnosticsDir = path.join(distDir, 'diagnostics')
  await fs.mkdir(diagnosticsDir, { recursive: true })
  await fs.writeFile(
    path.join(diagnosticsDir, ROUTE_BUNDLE_STATS_FILE),
    JSON.stringify(rows, null, 2)
  )
}
