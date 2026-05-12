/**
 * CLI command for analyzing a built Next.js app's route bundle sizes.
 * Reads manifests and .nft.json trace files statically without running the app.
 *
 * Usage: next internal static-routes-info [directory] [--json] [--limit N]
 */

import fs from 'fs'
import path from 'path'
import loadConfig from '../../server/config'
import { PHASE_PRODUCTION_BUILD } from '../../shared/lib/constants'

export interface StaticRoutesInfoOptions {
  json?: boolean
  limit?: number
}

interface CategoryStats {
  count: number
  bytes: number
}

interface RouteInfo {
  route: string
  type: string
  serverBundled: CategoryStats
  serverMaps: CategoryStats
  serverUnbundled: CategoryStats
  clientJs: CategoryStats
  clientMaps: CategoryStats
  clientCss: CategoryStats
}

interface FileSets {
  /** Paths relative to distDir */
  serverBundled: Set<string>
  /** Paths relative to distDir */
  serverMaps: Set<string>
  /** Absolute on-disk paths (outside distDir) */
  serverUnbundled: Set<string>
  /** Paths relative to distDir */
  clientJs: Set<string>
  /** Paths relative to distDir */
  clientMaps: Set<string>
  /** Paths relative to distDir */
  clientCss: Set<string>
}

interface RouteEntry {
  /** URL path shown to users, e.g. "/streaming/chunkstorm" */
  route: string
  /**
   * One of: "app-page" | "app-route" | "pages" | "pages-api" |
   * "pages-static" | "edge-function"
   */
  type: string
  /**
   * Path relative to distDir/server, e.g. "app/streaming/chunkstorm/page.js".
   * Empty for "pages-static". For "edge-function" this is a special encoded
   * marker `__edge__:<json-array-of-files>`.
   */
  serverEntry: string
}

// ---------------------------------------------------------------------------
// Route discovery
// ---------------------------------------------------------------------------

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

const SKIP_PAGES_ENTRIES = new Set([
  '/_app',
  '/_document',
  '/_error',
  '/404',
  '/500',
])

const SKIP_APP_ENTRIES = new Set(['/_global-error/page'])

function discoverRoutes(distDir: string): RouteEntry[] {
  const routes: RouteEntry[] = []

  // ── Pages Router ──────────────────────────────────────────────────────────
  const pagesManifest = readJsonFile<Record<string, string>>(
    path.join(distDir, 'server', 'pages-manifest.json')
  )
  if (pagesManifest) {
    for (const [route, entry] of Object.entries(pagesManifest)) {
      if (SKIP_PAGES_ENTRIES.has(route)) continue
      if (entry.endsWith('.js')) {
        const type = route.startsWith('/api/') ? 'pages-api' : 'pages'
        routes.push({ route, type, serverEntry: entry })
      } else if (entry.endsWith('.html')) {
        // Statically pre-rendered Pages Router page — no server JS bundle, but
        // it still ships client JS via build-manifest.json.
        routes.push({ route, type: 'pages-static', serverEntry: '' })
      }
    }
  }

  // ── App Router ─────────────────────────────────────────────────────────────
  const appPathsManifest = readJsonFile<Record<string, string>>(
    path.join(distDir, 'server', 'app-paths-manifest.json')
  )
  const appPathRoutesManifest = readJsonFile<Record<string, string>>(
    path.join(distDir, 'app-path-routes-manifest.json')
  )
  if (appPathsManifest) {
    for (const [internalKey, entry] of Object.entries(appPathsManifest)) {
      if (SKIP_APP_ENTRIES.has(internalKey)) continue
      if (!entry.endsWith('.js')) continue
      const routeUrl = appPathRoutesManifest?.[internalKey] ?? internalKey
      const type = internalKey.endsWith('/route') ? 'app-route' : 'app-page'
      routes.push({ route: routeUrl, type, serverEntry: entry })
    }
  }

  // ── Middleware / Edge functions ────────────────────────────────────────────
  const middlewareManifest = readJsonFile<{
    functions?: Record<string, { files: string[]; name: string; page: string }>
  }>(path.join(distDir, 'server', 'middleware-manifest.json'))
  if (middlewareManifest?.functions) {
    for (const [page, def] of Object.entries(middlewareManifest.functions)) {
      // Use a placeholder serverEntry; edge function files are read separately
      routes.push({
        route: page,
        type: 'edge-function',
        serverEntry: `__edge__:${JSON.stringify(def.files)}`,
      })
    }
  }

  return routes
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

/**
 * Parse the JSON blob from a _client-reference-manifest.js file.
 * The file looks like:
 *   globalThis.__RSC_MANIFEST["..."] = {...};
 */
function parseClientReferenceManifest(filePath: string): {
  entryJSFiles?: Record<string, string[]>
  entryCSSFiles?: Record<string, Array<string | { path: string }>>
} | null {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
  const marker = '] = '
  const idx = content.indexOf(marker)
  if (idx === -1) return null
  const jsonStr = content
    .slice(idx + marker.length)
    .trimEnd()
    .replace(/;$/, '')
  try {
    return JSON.parse(jsonStr)
  } catch {
    return null
  }
}

/**
 * Collect all 6 file-sets for a single route by reading nft.json and manifests.
 * All server/client paths are relative to distDir; unbundled paths are absolute.
 */
function collectFiles(distDir: string, entry: RouteEntry): FileSets {
  const sets: FileSets = {
    serverBundled: new Set(),
    serverMaps: new Set(),
    serverUnbundled: new Set(),
    clientJs: new Set(),
    clientMaps: new Set(),
    clientCss: new Set(),
  }

  // ── Edge functions ──────────────────────────────────────────────────────────
  if (entry.type === 'edge-function') {
    const files: string[] = JSON.parse(
      entry.serverEntry.slice('__edge__:'.length)
    )
    for (const f of files) {
      if (f.endsWith('.js')) {
        sets.serverBundled.add(f)
      }
    }
    deriveServerMaps(distDir, sets)
    return sets
  }

  // ── Static HTML page (Pages Router) ────────────────────────────────────────
  if (entry.type === 'pages-static') {
    collectPagesClientJs(distDir, entry, sets)
    deriveClientMaps(distDir, sets)
    return sets
  }

  // ── Server entry + nft.json ─────────────────────────────────────────────────
  const entryRelToDistDir = path.join('server', entry.serverEntry) // e.g. server/app/page.js
  const entryDirRelToDistDir = path.dirname(entryRelToDistDir) // e.g. server/app
  const entryDirAbsolute = path.join(distDir, entryDirRelToDistDir)

  sets.serverBundled.add(entryRelToDistDir)

  const nftPath = path.join(distDir, entryRelToDistDir + '.nft.json')
  if (fs.existsSync(nftPath)) {
    const nft = readJsonFile<{ files: string[] }>(nftPath)
    if (nft?.files) {
      for (const relPath of nft.files) {
        const normalizedRelToDistDir = path.normalize(
          path.join(entryDirRelToDistDir, relPath)
        )
        if (normalizedRelToDistDir.startsWith('..')) {
          // Outside distDir → unbundled
          const absPath = path.resolve(entryDirAbsolute, relPath)
          sets.serverUnbundled.add(absPath)
        } else if (
          normalizedRelToDistDir.endsWith('.js') &&
          !normalizedRelToDistDir.endsWith('_client-reference-manifest.js')
        ) {
          // Within distDir, real JS chunk → bundled
          sets.serverBundled.add(normalizedRelToDistDir)
        }
        // .json manifests and _client-reference-manifest.js → skip
      }
    }
  }

  deriveServerMaps(distDir, sets)

  // ── Client JS / CSS (App Router) ────────────────────────────────────────────
  if (entry.type === 'app-page' || entry.type === 'app-route') {
    const entryBase = path.basename(entry.serverEntry, '.js')
    const crmPath = path.join(
      distDir,
      'server',
      path.dirname(entry.serverEntry),
      `${entryBase}_client-reference-manifest.js`
    )
    const crm = parseClientReferenceManifest(crmPath)
    if (crm) {
      // Client JS from entryJSFiles
      for (const chunks of Object.values(crm.entryJSFiles ?? {})) {
        for (const chunk of chunks) {
          sets.clientJs.add(chunk.replace(/^\/?_next\//, ''))
        }
      }
      // Client CSS from entryCSSFiles
      for (const cssFiles of Object.values(crm.entryCSSFiles ?? {})) {
        for (const css of cssFiles) {
          const p =
            typeof css === 'string'
              ? css.replace(/^\/?_next\//, '')
              : css.path.replace(/^\/?_next\//, '')
          if (p) sets.clientCss.add(p)
        }
      }
    }

    // rootMainFiles from per-route build-manifest
    const bmPath = path.join(
      distDir,
      'server',
      path.dirname(entry.serverEntry),
      entryBase,
      'build-manifest.json'
    )
    const bm = readJsonFile<{ rootMainFiles?: string[] }>(bmPath)
    for (const chunk of bm?.rootMainFiles ?? []) {
      sets.clientJs.add(chunk)
    }
  }

  // ── Client JS (Pages Router pages) ─────────────────────────────────────────
  if (entry.type === 'pages') {
    collectPagesClientJs(distDir, entry, sets)
  }

  // Client source maps
  deriveClientMaps(distDir, sets)

  return sets
}

function collectPagesClientJs(
  distDir: string,
  entry: RouteEntry,
  sets: FileSets
): void {
  const globalBm = readJsonFile<{
    pages?: Record<string, string[]>
    polyfillFiles?: string[]
  }>(path.join(distDir, 'build-manifest.json'))
  if (!globalBm) return
  const appChunks = globalBm.pages?.['/_app'] ?? []
  const pageChunks = globalBm.pages?.[entry.route] ?? []
  const polyfills = globalBm.polyfillFiles ?? []
  for (const chunk of [...appChunks, ...pageChunks, ...polyfills]) {
    sets.clientJs.add(chunk)
  }
}

function deriveClientMaps(distDir: string, sets: FileSets): void {
  for (const f of sets.clientJs) {
    const mapPath = f + '.map'
    if (fs.existsSync(path.join(distDir, mapPath))) {
      sets.clientMaps.add(mapPath)
    }
  }
}

function deriveServerMaps(distDir: string, sets: FileSets): void {
  for (const f of sets.serverBundled) {
    const mapPath = f + '.map'
    if (fs.existsSync(path.join(distDir, mapPath))) {
      sets.serverMaps.add(mapPath)
    }
  }
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

function measureSet(
  distDir: string,
  fileSet: Set<string>,
  isAbsolute = false
): CategoryStats {
  let count = 0
  let bytes = 0
  for (const f of fileSet) {
    const fullPath = isAbsolute ? f : path.join(distDir, f)
    try {
      const stat = fs.lstatSync(fullPath)
      if (!stat.isFile() || stat.isSymbolicLink()) continue
      bytes += stat.size
      count++
    } catch {
      // File not found or inaccessible — skip silently
    }
  }
  return { count, bytes }
}

function measureFileSets(
  distDir: string,
  sets: FileSets
): Omit<RouteInfo, 'route' | 'type'> {
  return {
    serverBundled: measureSet(distDir, sets.serverBundled),
    serverMaps: measureSet(distDir, sets.serverMaps),
    serverUnbundled: measureSet(distDir, sets.serverUnbundled, true),
    clientJs: measureSet(distDir, sets.clientJs),
    clientMaps: measureSet(distDir, sets.clientMaps),
    clientCss: measureSet(distDir, sets.clientCss),
  }
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

function mergeSets(all: FileSets[]): FileSets {
  const merged: FileSets = {
    serverBundled: new Set(),
    serverMaps: new Set(),
    serverUnbundled: new Set(),
    clientJs: new Set(),
    clientMaps: new Set(),
    clientCss: new Set(),
  }
  for (const s of all) {
    for (const f of s.serverBundled) merged.serverBundled.add(f)
    for (const f of s.serverMaps) merged.serverMaps.add(f)
    for (const f of s.serverUnbundled) merged.serverUnbundled.add(f)
    for (const f of s.clientJs) merged.clientJs.add(f)
    for (const f of s.clientMaps) merged.clientMaps.add(f)
    for (const f of s.clientCss) merged.clientCss.add(f)
  }
  return merged
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(2) + ' KB'
  return n + ' B'
}

function formatCell(stats: CategoryStats): string {
  return `${stats.count} files / ${formatBytes(stats.bytes)}`
}

function totalBytes(info: Omit<RouteInfo, 'route' | 'type'>): number {
  return (
    info.serverBundled.bytes +
    info.serverMaps.bytes +
    info.serverUnbundled.bytes +
    info.clientJs.bytes +
    info.clientMaps.bytes +
    info.clientCss.bytes
  )
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printMarkdown(
  routes: RouteInfo[],
  totals: Omit<RouteInfo, 'route' | 'type'>
): void {
  const headers = [
    'Route',
    'Type',
    'Server Bundled JS',
    'Server Maps',
    'Server Unbundled',
    'Client JS',
    'Client Maps',
    'Client CSS',
  ]

  const rows: string[][] = routes.map((r) => [
    r.route,
    r.type,
    formatCell(r.serverBundled),
    formatCell(r.serverMaps),
    formatCell(r.serverUnbundled),
    formatCell(r.clientJs),
    formatCell(r.clientMaps),
    formatCell(r.clientCss),
  ])

  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length))
  )

  const header =
    '| ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + ' |'
  const divider = '| ' + colWidths.map((w) => '-'.repeat(w)).join(' | ') + ' |'

  console.log('## Routes\n')
  console.log(header)
  console.log(divider)
  for (const row of rows) {
    console.log(
      '| ' + row.map((cell, i) => cell.padEnd(colWidths[i])).join(' | ') + ' |'
    )
  }

  // Totals table
  const totalHeaders = [
    '',
    'Server Bundled JS',
    'Server Maps',
    'Server Unbundled',
    'Client JS',
    'Client Maps',
    'Client CSS',
  ]
  const totalRow = [
    '**Total**',
    formatCell(totals.serverBundled),
    formatCell(totals.serverMaps),
    formatCell(totals.serverUnbundled),
    formatCell(totals.clientJs),
    formatCell(totals.clientMaps),
    formatCell(totals.clientCss),
  ]
  const totalColWidths = totalHeaders.map((h, i) =>
    Math.max(h.length, totalRow[i].length)
  )

  console.log('\n## Totals\n')
  console.log(
    '| ' +
      totalHeaders.map((h, i) => h.padEnd(totalColWidths[i])).join(' | ') +
      ' |'
  )
  console.log(
    '| ' + totalColWidths.map((w) => '-'.repeat(w)).join(' | ') + ' |'
  )
  console.log(
    '| ' +
      totalRow.map((cell, i) => cell.padEnd(totalColWidths[i])).join(' | ') +
      ' |'
  )
}

function printJson(
  routes: RouteInfo[],
  totals: Omit<RouteInfo, 'route' | 'type'>
): void {
  console.log(JSON.stringify({ routes, totals }, null, 2))
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function staticRoutesInfoCli(
  options: StaticRoutesInfoOptions,
  directory: string | undefined
): Promise<void> {
  const dir = path.resolve(directory ?? process.cwd())

  // Load Next.js config to find distDir
  const config = await loadConfig(PHASE_PRODUCTION_BUILD, dir)
  const distDir = path.join(dir, config.distDir)

  // Verify the build exists
  const buildIdPath = path.join(distDir, 'BUILD_ID')
  if (!fs.existsSync(buildIdPath)) {
    console.error(
      `Error: No build found at ${distDir}. Run \`next build\` first.`
    )
    process.exit(1)
  }

  // Discover all routes
  const routeEntries = discoverRoutes(distDir)

  // Collect and measure files for each route
  const allFileSets: FileSets[] = []
  const routeInfos: RouteInfo[] = []

  for (const entry of routeEntries) {
    const fileSets = collectFiles(distDir, entry)
    allFileSets.push(fileSets)
    const measured = measureFileSets(distDir, fileSets)
    routeInfos.push({ route: entry.route, type: entry.type, ...measured })
  }

  // Sort by total bytes descending
  routeInfos.sort((a, b) => totalBytes(b) - totalBytes(a))

  // Compute totals from ALL routes (before applying --limit)
  const mergedSets = mergeSets(allFileSets)
  const totals = measureFileSets(distDir, mergedSets)

  // Apply --limit
  const displayRoutes =
    options.limit != null && options.limit > 0
      ? routeInfos.slice(0, options.limit)
      : routeInfos

  if (options.json) {
    printJson(displayRoutes, totals)
  } else {
    printMarkdown(displayRoutes, totals)
  }
}
