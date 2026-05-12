/**
 * `next internal static-routes-info` — analyzes a built Next.js app and
 * reports per-route bundle sizes statically (without running the app).
 *
 * The analysis is split into three steps so it's easy to swap in different
 * chunking strategies later:
 *
 *   1. Capture: for each route, collect a set of files that belong to it,
 *      partitioned into 6 disjoint categories.
 *   2. Deduplicate: per-route sets are already deduplicated (Set<>), and we
 *      union them across routes for project-wide totals.
 *   3. Measure: stat each unique file path to get { count, bytes }.
 *
 * Output is markdown by default, or JSON with `--json`. `--limit N` keeps
 * only the top N routes (totals always reflect all routes).
 */

import fs from 'fs'
import path from 'path'
import loadConfig from '../../server/config'
import { PHASE_PRODUCTION_BUILD } from '../../shared/lib/constants'

export interface StaticRoutesInfoOptions {
  json?: boolean
  limit?: number
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/**
 * The 6 file categories we partition each route's files into. Each file is
 * placed into exactly one category to avoid double-counting.
 *
 * To add a new category, extend this tuple, add a label below, and update
 * the relevant collector(s).
 */
const CATEGORIES = [
  'serverBundled',
  'serverMaps',
  'serverUnbundled',
  'clientJs',
  'clientMaps',
  'clientCss',
] as const
type Category = (typeof CATEGORIES)[number]

/** Human-readable column titles, in the same order as CATEGORIES. */
const CATEGORY_LABELS: Record<Category, string> = {
  serverBundled: 'Server Bundled JS',
  serverMaps: 'Server Maps',
  serverUnbundled: 'Server Unbundled',
  clientJs: 'Client JS',
  clientMaps: 'Client Maps',
  clientCss: 'Client CSS',
}

/**
 * Per-route file sets, one entry per category.
 *
 * Paths are stored as:
 *   - relative to `distDir` for in-distDir files, and
 *   - absolute paths for `serverUnbundled` (which lives outside `distDir`).
 *
 * Storing paths consistently lets us deduplicate by string equality both
 * per-route and across routes (for the totals).
 */
type FileSets = Record<Category, Set<string>>

interface CategoryStats {
  count: number
  bytes: number
}

type CategoryStatsByKey = Record<Category, CategoryStats>

interface RouteInfo extends CategoryStatsByKey {
  route: string
  type: string
}

function emptyFileSets(): FileSets {
  return {
    serverBundled: new Set(),
    serverMaps: new Set(),
    serverUnbundled: new Set(),
    clientJs: new Set(),
    clientMaps: new Set(),
    clientCss: new Set(),
  }
}

// ---------------------------------------------------------------------------
// Route discovery
// ---------------------------------------------------------------------------

/**
 * One discovered route. Discriminated by `type`; the additional fields
 * carry whatever the file collector needs to find this route's files.
 */
type RouteEntry =
  /**
   * Server-rendered Pages or App route. `serverEntry` is the path of the
   * .js bundle relative to `distDir/server`, e.g. `app/page.js`.
   */
  | {
      type: 'app-page' | 'app-route' | 'pages' | 'pages-api'
      route: string
      serverEntry: string
    }
  /** Statically pre-rendered Pages page. Only ships client JS. */
  | { type: 'pages-static'; route: string }
  /**
   * Edge route handler / function. `files` comes directly from
   * `middleware-manifest.json#functions[page].files`.
   */
  | { type: 'edge-function'; route: string; files: string[] }

/**
 * Pages Router infrastructure entries we never report as routes.
 * `_app` / `_document` / `_error` aren't really routes, and `404` / `500`
 * are HTML-only error pages.
 */
const SKIP_PAGES_ENTRIES = new Set<string>([
  '/_app',
  '/_document',
  '/_error',
  '/404',
  '/500',
])

/** App Router infrastructure entries we never report as routes. */
const SKIP_APP_ENTRIES = new Set<string>(['/_global-error/page'])

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

function discoverRoutes(distDir: string): RouteEntry[] {
  return [
    ...discoverPagesRoutes(distDir),
    ...discoverAppRoutes(distDir),
    ...discoverEdgeRoutes(distDir),
  ]
}

function discoverPagesRoutes(distDir: string): RouteEntry[] {
  const manifest = readJsonFile<Record<string, string>>(
    path.join(distDir, 'server', 'pages-manifest.json')
  )
  if (!manifest) return []

  const routes: RouteEntry[] = []
  for (const [route, entry] of Object.entries(manifest)) {
    if (SKIP_PAGES_ENTRIES.has(route)) continue
    if (entry.endsWith('.js')) {
      routes.push({
        type: route.startsWith('/api/') ? 'pages-api' : 'pages',
        route,
        serverEntry: entry,
      })
    } else if (entry.endsWith('.html')) {
      // Statically pre-rendered page — no server JS bundle, but still ships
      // client JS via build-manifest.json.
      routes.push({ type: 'pages-static', route })
    }
  }
  return routes
}

function discoverAppRoutes(distDir: string): RouteEntry[] {
  const appPathsManifest = readJsonFile<Record<string, string>>(
    path.join(distDir, 'server', 'app-paths-manifest.json')
  )
  if (!appPathsManifest) return []

  // Maps internal entry keys (e.g. "/blog/[slug]/page") to their URL path
  // ("/blog/[slug]"). Optional — falls back to the internal key if missing.
  const appPathRoutesManifest = readJsonFile<Record<string, string>>(
    path.join(distDir, 'app-path-routes-manifest.json')
  )

  const routes: RouteEntry[] = []
  for (const [internalKey, entry] of Object.entries(appPathsManifest)) {
    if (SKIP_APP_ENTRIES.has(internalKey)) continue
    if (!entry.endsWith('.js')) continue
    routes.push({
      type: internalKey.endsWith('/route') ? 'app-route' : 'app-page',
      route: appPathRoutesManifest?.[internalKey] ?? internalKey,
      serverEntry: entry,
    })
  }
  return routes
}

function discoverEdgeRoutes(distDir: string): RouteEntry[] {
  const manifest = readJsonFile<{
    functions?: Record<string, { files: string[] }>
  }>(path.join(distDir, 'server', 'middleware-manifest.json'))
  if (!manifest?.functions) return []

  return Object.entries(manifest.functions).map(([page, def]) => ({
    type: 'edge-function' as const,
    route: page,
    files: def.files,
  }))
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

/**
 * Strip the `_next/` URL prefix that some manifests use (with or without a
 * leading slash) so all client paths are consistently relative to `distDir`.
 */
function stripNextPrefix(p: string): string {
  return p.replace(/^\/?_next\//, '')
}

/**
 * Walk the entry's `.nft.json` (Node File Trace) and partition its files:
 *   - `serverBundled`: .js files that resolve INSIDE distDir (server chunks)
 *   - `serverUnbundled`: any file that resolves OUTSIDE distDir (traced
 *     node_modules and other on-disk deps the server entry needs at runtime)
 *
 * Skips `.json` manifests and `_client-reference-manifest.js` files since
 * they aren't executable code we want to count as a server JS bundle.
 */
function collectServerEntryFiles(
  distDir: string,
  serverEntry: string,
  sets: FileSets
): void {
  const entryRel = path.join('server', serverEntry) // e.g. server/app/page.js
  const entryDirRel = path.dirname(entryRel) // e.g. server/app
  const entryDirAbs = path.join(distDir, entryDirRel)

  // The entry .js is always part of the bundle, even if no nft.json exists.
  sets.serverBundled.add(entryRel)

  const nft = readJsonFile<{ files: string[] }>(
    path.join(distDir, entryRel + '.nft.json')
  )
  if (!nft?.files) return

  for (const relPath of nft.files) {
    // Resolve relative to the entry's dir. If the normalized result stays
    // inside distDir it's a server chunk; if it leaves distDir it's an
    // unbundled trace dep (e.g. ../../../node_modules/...).
    const inDistDirPath = path.normalize(path.join(entryDirRel, relPath))
    if (inDistDirPath.startsWith('..')) {
      sets.serverUnbundled.add(path.resolve(entryDirAbs, relPath))
    } else if (
      inDistDirPath.endsWith('.js') &&
      !inDistDirPath.endsWith('_client-reference-manifest.js')
    ) {
      sets.serverBundled.add(inDistDirPath)
    }
  }
}

/**
 * Read a `_client-reference-manifest.js` file and extract the JSON blob.
 *
 * The file is a JS module that assigns a JSON object to a global, e.g.
 *   globalThis.__RSC_MANIFEST["/page"] = {...};
 *
 * Rather than evaluate the JS, slice the substring after `"] = "` and
 * parse it as JSON.
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
 * Collect client JS chunks and CSS files for an App Router page/route.
 * Source: the route's `_client-reference-manifest.js` (entryJSFiles +
 * entryCSSFiles) plus its per-route `build-manifest.json` (rootMainFiles —
 * the shared App Router framework chunks).
 */
function collectAppClientFiles(
  distDir: string,
  serverEntry: string,
  sets: FileSets
): void {
  const entryDir = path.dirname(serverEntry)
  const entryBase = path.basename(serverEntry, '.js')
  const baseDir = path.join(distDir, 'server', entryDir)

  const crm = parseClientReferenceManifest(
    path.join(baseDir, `${entryBase}_client-reference-manifest.js`)
  )
  if (crm) {
    for (const chunks of Object.values(crm.entryJSFiles ?? {})) {
      for (const chunk of chunks) sets.clientJs.add(stripNextPrefix(chunk))
    }
    for (const cssFiles of Object.values(crm.entryCSSFiles ?? {})) {
      for (const css of cssFiles) {
        const cssPath = typeof css === 'string' ? css : css.path
        if (cssPath) sets.clientCss.add(stripNextPrefix(cssPath))
      }
    }
  }

  // Per-route build-manifest contributes the shared App Router root chunks.
  const bm = readJsonFile<{ rootMainFiles?: string[] }>(
    path.join(baseDir, entryBase, 'build-manifest.json')
  )
  for (const chunk of bm?.rootMainFiles ?? []) sets.clientJs.add(chunk)
}

/**
 * Collect client JS for a Pages Router route. The global `build-manifest.json`
 * lists each page's chunks (`pages[route]`), the shared baseline (`/_app`),
 * and `polyfillFiles`. Per-page CSS is not tracked in the Pages build output,
 * so it's not collected here.
 */
function collectPagesClientFiles(
  distDir: string,
  route: string,
  sets: FileSets
): void {
  const bm = readJsonFile<{
    pages?: Record<string, string[]>
    polyfillFiles?: string[]
  }>(path.join(distDir, 'build-manifest.json'))
  if (!bm) return
  const chunks = [
    ...(bm.pages?.['/_app'] ?? []),
    ...(bm.pages?.[route] ?? []),
    ...(bm.polyfillFiles ?? []),
  ]
  for (const chunk of chunks) sets.clientJs.add(chunk)
}

/**
 * For each file in `source`, find its source map (if any) and add it to
 * `target`. We try two strategies, in order:
 *
 *   1. Read the `//# sourceMappingURL=...` trailer that bundlers emit at
 *      the end of `.js` / `.css` files. This is the most accurate way
 *      because the URL filename can differ from the source filename
 *      (e.g. Turbopack hashes `.map` content separately).
 *   2. If no trailer is present (e.g. tiny "loader" entry files Turbopack
 *      emits without a comment), fall back to a co-located `<file>.map`.
 *
 * Only same-directory relative URLs are followed — `data:` URLs (inline
 * source maps) and absolute URLs are ignored.
 */
function deriveSourceMaps(
  distDir: string,
  source: Set<string>,
  target: Set<string>
): void {
  for (const f of source) {
    const mapFromUrl = readSourceMappingURL(path.join(distDir, f))
    if (mapFromUrl) {
      // Resolve relative to the source file's directory, then re-express
      // relative to distDir so paths join consistently.
      const mapRel = path.normalize(path.join(path.dirname(f), mapFromUrl))
      if (
        !mapRel.startsWith('..') &&
        fs.existsSync(path.join(distDir, mapRel))
      ) {
        target.add(mapRel)
        continue
      }
    }
    // Fallback: co-located `<file>.map`.
    const adjacent = f + '.map'
    if (fs.existsSync(path.join(distDir, adjacent))) target.add(adjacent)
  }
}

/**
 * Read the trailing `//# sourceMappingURL=...` (JS) or `/*# sourceMappingURL=... *​/`
 * (CSS) comment from a file and return the URL, or null if absent or
 * inline (`data:`).
 *
 * We only need to read the tail of the file — the comment is conventionally
 * the very last line — so reading 4 KiB is more than enough.
 */
function readSourceMappingURL(filePath: string): string | null {
  let fd: number
  try {
    fd = fs.openSync(filePath, 'r')
  } catch {
    return null
  }
  try {
    const stat = fs.fstatSync(fd)
    const len = Math.min(stat.size, 4096)
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, stat.size - len)
    const tail = buf.toString('utf8')
    // Match either `//# sourceMappingURL=<url>` or
    //   `/*# sourceMappingURL=<url> */` near the end.
    const match = tail.match(/[/*]#\s*sourceMappingURL=([^\s'"*]+)/)
    if (!match) return null
    const url = match[1]
    if (url.startsWith('data:')) return null
    // Skip absolute URLs (http://, https://, /abs).
    if (/^[a-z]+:\/\//i.test(url) || url.startsWith('/')) return null
    return url
  } catch {
    return null
  } finally {
    fs.closeSync(fd)
  }
}

/** Collect all 6 file-sets for a single route. */
function collectFiles(distDir: string, entry: RouteEntry): FileSets {
  const sets = emptyFileSets()

  switch (entry.type) {
    case 'edge-function':
      // Edge functions have no separate trace file — the bundle files are
      // listed directly in middleware-manifest.json.
      for (const f of entry.files) {
        if (f.endsWith('.js')) sets.serverBundled.add(f)
      }
      break
    case 'pages-static':
      collectPagesClientFiles(distDir, entry.route, sets)
      break
    case 'pages':
      collectServerEntryFiles(distDir, entry.serverEntry, sets)
      collectPagesClientFiles(distDir, entry.route, sets)
      break
    case 'pages-api':
      collectServerEntryFiles(distDir, entry.serverEntry, sets)
      break
    case 'app-page':
    case 'app-route':
      collectServerEntryFiles(distDir, entry.serverEntry, sets)
      collectAppClientFiles(distDir, entry.serverEntry, sets)
      break
    default:
      // Exhaustiveness check — TS will error here if a new RouteEntry
      // variant is added without a matching case.
      entry satisfies never
  }

  // Source maps for everything we collected above. Both .js.map and
  // .css.map files are picked up by reading the `sourceMappingURL`
  // trailer of each source file.
  deriveSourceMaps(distDir, sets.serverBundled, sets.serverMaps)
  deriveSourceMaps(distDir, sets.clientJs, sets.clientMaps)
  deriveSourceMaps(distDir, sets.clientCss, sets.clientMaps)

  return sets
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/**
 * Stat each path in the set, summing bytes and counting files. Symlinks and
 * non-files (directories, etc.) are skipped — `distDir/node_modules/...`
 * symlinks for example shouldn't be counted as files.
 */
function measureSet(
  distDir: string,
  fileSet: Set<string>,
  isAbsolute: boolean
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
      // Ignore missing/inaccessible files.
    }
  }
  return { count, bytes }
}

function measureFileSets(distDir: string, sets: FileSets): CategoryStatsByKey {
  return {
    serverBundled: measureSet(distDir, sets.serverBundled, false),
    serverMaps: measureSet(distDir, sets.serverMaps, false),
    // Only `serverUnbundled` stores absolute paths (see FileSets docs).
    serverUnbundled: measureSet(distDir, sets.serverUnbundled, true),
    clientJs: measureSet(distDir, sets.clientJs, false),
    clientMaps: measureSet(distDir, sets.clientMaps, false),
    clientCss: measureSet(distDir, sets.clientCss, false),
  }
}

/** Union of all per-route file sets. Used to compute project-wide totals. */
function mergeSets(all: FileSets[]): FileSets {
  const merged = emptyFileSets()
  for (const sets of all) {
    for (const cat of CATEGORIES) {
      for (const f of sets[cat]) merged[cat].add(f)
    }
  }
  return merged
}

function totalBytes(stats: CategoryStatsByKey): number {
  let sum = 0
  for (const cat of CATEGORIES) sum += stats[cat].bytes
  return sum
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(2) + ' KB'
  return n + ' B'
}

function formatCell(stats: CategoryStats): string {
  return `${stats.count} files / ${formatBytes(stats.bytes)}`
}

/** Render a fixed-width markdown table — pads each cell to align columns. */
function renderMarkdownTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length))
  )
  const formatRow = (cells: string[]) =>
    '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |'
  const divider = '| ' + widths.map((w) => '-'.repeat(w)).join(' | ') + ' |'
  return [formatRow(headers), divider, ...rows.map(formatRow)].join('\n')
}

function printMarkdown(routes: RouteInfo[], totals: CategoryStatsByKey): void {
  const categoryHeaders = CATEGORIES.map((c) => CATEGORY_LABELS[c])

  const routeRows = routes.map((r) => [
    r.route,
    r.type,
    ...CATEGORIES.map((c) => formatCell(r[c])),
  ])
  console.log('## Routes\n')
  console.log(
    renderMarkdownTable(['Route', 'Type', ...categoryHeaders], routeRows)
  )

  const totalsRow = [
    '**Total**',
    ...CATEGORIES.map((c) => formatCell(totals[c])),
  ]
  console.log('\n## Totals\n')
  console.log(renderMarkdownTable(['', ...categoryHeaders], [totalsRow]))
}

function printJson(routes: RouteInfo[], totals: CategoryStatsByKey): void {
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
  const config = await loadConfig(PHASE_PRODUCTION_BUILD, dir)
  const distDir = path.join(dir, config.distDir)

  // BUILD_ID is the standard sentinel that a Next.js build completed.
  if (!fs.existsSync(path.join(distDir, 'BUILD_ID'))) {
    console.error(
      `Error: No build found at ${distDir}. Run \`next build\` first.`
    )
    process.exit(1)
  }

  // Step 1+2: capture per-route files (sets implicitly deduplicate).
  const routeEntries = discoverRoutes(distDir)
  const allFileSets = routeEntries.map((entry) => collectFiles(distDir, entry))

  // Step 3: measure per-route, then sort by total size descending.
  const routeInfos: RouteInfo[] = routeEntries.map((entry, i) => ({
    route: entry.route,
    type: entry.type,
    ...measureFileSets(distDir, allFileSets[i]),
  }))
  routeInfos.sort((a, b) => totalBytes(b) - totalBytes(a))

  // Project-wide totals — union of all route sets, regardless of --limit.
  const totals = measureFileSets(distDir, mergeSets(allFileSets))

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
