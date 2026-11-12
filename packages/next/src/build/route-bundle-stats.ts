import path from 'path'
import { promises as fs } from 'fs'
import { APP_PATHS_MANIFEST, SERVER_DIRECTORY } from '../shared/lib/constants'
import type { BuildManifest } from '../server/get-page-files'
import { filterAndSortList } from './utils'

const ROUTE_BUNDLE_STATS_FILE = 'route-bundle-stats.json'

// Written by Turbopack next to each app page's client reference manifest in
// production builds. It holds the same data as the manifest's `entryJSFiles`.
const ENTRY_JS_FILES_MANIFEST_SUFFIX = '_entry-js-files.json'

// Bounds the number of concurrent file system operations.
const IO_CONCURRENCY = 64

async function mapConcurrent<T, R>(
  items: ReadonlyArray<T>,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(IO_CONCURRENCY, items.length) }, worker)
  )
  return results
}

type RouteBundleStat = {
  route: string
  firstLoadUncompressedJsBytes: number
  firstLoadChunkPaths: string[]
}

type ChunkInfo = {
  // Undefined when the file is missing.
  size: number | undefined
  projectRelativePath: string
}

// Stats every distinct chunk once and computes its project relative path.
async function getChunkInfos(
  dir: string,
  distDir: string,
  chunkLists: ReadonlyArray<ReadonlyArray<string>>
): Promise<Map<string, ChunkInfo>> {
  const files = [...new Set(chunkLists.flat())]
  const infos = new Map<string, ChunkInfo>()
  await mapConcurrent(files, async (relPath) => {
    const absolutePath = path.join(distDir, relPath)
    let size: number | undefined
    try {
      size = (await fs.stat(absolutePath)).size
    } catch {
      // ignore missing files
    }
    infos.set(relPath, {
      size,
      // Always use forward slashes, so the stats are the same on all platforms.
      projectRelativePath: path
        .relative(dir, absolutePath)
        .split(path.sep)
        .join('/'),
    })
  })
  return infos
}

function sumFileSizes(files: string[], infos: Map<string, ChunkInfo>): number {
  let total = 0
  for (const relPath of files) {
    total += infos.get(relPath)!.size ?? 0
  }
  return total
}

function toProjectRelativePaths(
  relPaths: string[],
  infos: Map<string, ChunkInfo>
): string[] {
  return relPaths.map((f) => infos.get(f)!.projectRelativePath)
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

// Reads the entry JS files (the client reference manifest's `entryJSFiles`)
// of an app page from the small JSON file Turbopack writes for this purpose,
// so the much larger client reference manifest doesn't need to be evaluated.
async function readEntryJSFiles(
  distDir: string,
  pagePath: string
): Promise<Record<string, string[]> | undefined> {
  const manifestFile = path.join(
    distDir,
    SERVER_DIRECTORY,
    'app',
    `${pagePath}${ENTRY_JS_FILES_MANIFEST_SUFFIX}`
  )
  try {
    return JSON.parse(await fs.readFile(manifestFile, 'utf8'))
  } catch {
    return undefined
  }
}

type RouteChunks = { route: string; chunks: string[] }

function collectPagesRouterChunks(
  pages: ReadonlyArray<string>,
  buildManifest: BuildManifest
): RouteChunks[] {
  const rows: RouteChunks[] = []
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
    rows.push({ route: page, chunks })
  }
  return rows
}

async function collectAppRouterChunks(
  appRoutes: ReadonlyArray<string>,
  buildManifest: BuildManifest,
  distDir: string
): Promise<RouteChunks[]> {
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
  const routes = filterAndSortList(appRoutes, 'app', false)
  const entryJSFilesPerRoute = await mapConcurrent(routes, async (appRoute) => {
    const appPaths = routeToAppPaths.get(appRoute) ?? []
    // Find the /page entry (most specific, has the most chunks)
    const pagePath = appPaths.find((p) => p.endsWith('/page'))
    return pagePath ? readEntryJSFiles(distDir, pagePath) : undefined
  })
  const rows: RouteChunks[] = []

  for (let i = 0; i < routes.length; i++) {
    const entryJSFiles = entryJSFilesPerRoute[i]
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
    rows.push({ route: routes[i], chunks })
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
  const routeChunks = [
    ...(lists.pages.length > 0
      ? collectPagesRouterChunks(lists.pages, buildManifest)
      : []),
    ...(lists.app && lists.app.length > 0
      ? await collectAppRouterChunks(lists.app, buildManifest, distDir)
      : []),
  ]

  const infos = await getChunkInfos(
    dir,
    distDir,
    routeChunks.map((r) => r.chunks)
  )
  const rows: RouteBundleStat[] = routeChunks.map(({ route, chunks }) => ({
    route,
    firstLoadUncompressedJsBytes: sumFileSizes(chunks, infos),
    firstLoadChunkPaths: toProjectRelativePaths(chunks, infos),
  }))

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
