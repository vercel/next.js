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
  sort?: string
  files?: boolean
}

/**
 * Available `--sort` keys. `name` sorts ascending alphabetically by route;
 * every other key is a numeric byte-total and sorts descending (biggest
 * first). Composite keys (`client`, `server`, `total`) sum across multiple
 * categories — see `sortValue` for the exact mapping.
 */
const SORT_KEYS = [
  'name',
  'client',
  'client-js',
  'client-css',
  'client-map',
  'server',
  'server-bundled-js',
  'server-unbundled',
  'server-map',
  'total',
] as const
type SortKey = (typeof SORT_KEYS)[number]

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
  'clientJs',
  'clientCss',
  'clientMaps',
  'serverBundled',
  'serverUnbundled',
  'serverMaps',
] as const
type Category = (typeof CATEGORIES)[number]

/** Human-readable column titles, in the same order as CATEGORIES. */
const CATEGORY_LABELS: Record<Category, string> = {
  clientJs: 'Client JS',
  clientCss: 'Client CSS',
  clientMaps: 'Client Source Maps',
  serverBundled: 'Server Bundled JS',
  serverUnbundled: 'Server Unbundled',
  serverMaps: 'Server Source Maps',
}

/**
 * Per-route file sets, one entry per category.
 *
 * Paths are stored either relative to `distDir` (for files that live inside
 * the build output) or as absolute paths (for files traced outside `distDir`,
 * e.g. `node_modules` deps in `serverUnbundled`, or .map files traced from
 * the same place). At measurement time we discriminate via
 * `path.isAbsolute()` so each category can mix the two.
 *
 * Storing paths as plain strings lets us deduplicate by string equality both
 * per-route and across routes (for the totals).
 */
type FileSets = Record<Category, Set<string>>

interface CategoryStats {
  count: number
  bytes: number
}

/**
 * Shared-with-peers stats. `count` and `bytes` are the average size of the
 * intersection of this route's files with each peer route's files (a "peer"
 * is another route of the same `type`). `percentCount` and `percentBytes`
 * are the same values expressed as a fraction of this route's own
 * `count` / `bytes`, in 0..100 — i.e. "what percentage of this route's
 * files / bytes are, on average, also shipped by a peer". Both are 0 when
 * the route's own value is 0 (degenerate case where the average is 0/0).
 */
interface SharedStats extends CategoryStats {
  percentCount: number
  percentBytes: number
}

/**
 * Per-route stats for one category, plus the average size of the intersection
 * with peer routes (other routes of the same type). `sharedAvg` is `null` when
 * the route has no peers (i.e. it's the only route of its type), since the
 * average is undefined.
 *
 * `files` is only populated when the user passes `--files` and lists every
 * path that contributed to `count`/`bytes`, in alphabetical order, expressed
 * relative to `distDir` (so traced node_modules deps appear as `../...`).
 */
interface CategoryStatsWithShared extends CategoryStats {
  sharedAvg: SharedStats | null
  files?: string[]
}

type CategoryStatsByKey = Record<Category, CategoryStats & { files?: string[] }>
type CategoryStatsWithSharedByKey = Record<Category, CategoryStatsWithShared>

interface RouteInfo extends CategoryStatsWithSharedByKey {
  route: string
  type: string
}

function emptyFileSets(): FileSets {
  const sets = {} as FileSets
  for (const cat of CATEGORIES) sets[cat] = new Set()
  return sets
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
   * Server-rendered Pages or App route. The `runtime` field describes how
   * its bundle is laid out:
   *   - `node`: a `.js` server entry plus a sibling `.nft.json` listing all
   *     runtime dependencies (the standard production bundle).
   *   - `edge`: no `.nft.json` — the bundle's chunks are listed directly
   *     in `middleware-manifest.json#functions[].files`.
   */
  | {
      type: 'app-page' | 'app-route' | 'pages' | 'pages-api'
      route: string
      runtime:
        | { kind: 'node'; serverEntry: string }
        | { kind: 'edge'; files: string[] }
    }
  /** Statically pre-rendered Pages page. Only ships client JS. */
  | { type: 'pages-static'; route: string }
  /**
   * Edge middleware (the `middleware.ts` file). Sourced from
   * `middleware-manifest.json#middleware[].files`. There's at most one
   * middleware per project, but the manifest format supports several keys.
   */
  | { type: 'middleware'; route: string; files: string[] }

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

interface MiddlewareManifestEntry {
  files: string[]
  page?: string
  name?: string
}

interface MiddlewareManifest {
  functions?: Record<string, MiddlewareManifestEntry>
  middleware?: Record<string, MiddlewareManifestEntry>
}

function discoverRoutes(distDir: string): RouteEntry[] {
  const middlewareManifest = readJsonFile<MiddlewareManifest>(
    path.join(distDir, 'server', 'middleware-manifest.json')
  )
  // Edge route handlers (per-route runtime: 'edge') live in `functions`.
  // Their key matches either an app-paths-manifest internal key (e.g.
  // `/api/edge/route`) or a pages-manifest route (e.g. `/api/edge` for
  // pages-router edge APIs). We use these inside the pages/app discovery
  // below to pick `runtime: edge` instead of node and get the bundled-file
  // list from middleware-manifest rather than `.nft.json`.
  const edgeFunctions = middlewareManifest?.functions ?? {}

  return [
    ...discoverPagesRoutes(distDir, edgeFunctions),
    ...discoverAppRoutes(distDir, edgeFunctions),
    ...discoverMiddleware(middlewareManifest?.middleware ?? {}),
  ]
}

function discoverPagesRoutes(
  distDir: string,
  edgeFunctions: Record<string, MiddlewareManifestEntry>
): RouteEntry[] {
  const manifest = readJsonFile<Record<string, string>>(
    path.join(distDir, 'server', 'pages-manifest.json')
  )
  if (!manifest) return []

  const routes: RouteEntry[] = []
  for (const [route, entry] of Object.entries(manifest)) {
    if (SKIP_PAGES_ENTRIES.has(route)) continue
    const isApi = route.startsWith('/api/')
    const edge = edgeFunctions[route]
    if (edge) {
      // Edge runtime — bundle files come from middleware-manifest, not nft.
      routes.push({
        type: isApi ? 'pages-api' : 'pages',
        route,
        runtime: { kind: 'edge', files: edge.files },
      })
    } else if (entry.endsWith('.js')) {
      routes.push({
        type: isApi ? 'pages-api' : 'pages',
        route,
        runtime: { kind: 'node', serverEntry: entry },
      })
    } else if (entry.endsWith('.html')) {
      // Statically pre-rendered page — no server JS bundle, but still ships
      // client JS via build-manifest.json.
      routes.push({ type: 'pages-static', route })
    }
  }
  return routes
}

function discoverAppRoutes(
  distDir: string,
  edgeFunctions: Record<string, MiddlewareManifestEntry>
): RouteEntry[] {
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
    const type = internalKey.endsWith('/route') ? 'app-route' : 'app-page'
    const route = appPathRoutesManifest?.[internalKey] ?? internalKey
    const edge = edgeFunctions[internalKey]
    if (edge) {
      // Edge runtime — turbopack writes a placeholder entry value (e.g.
      // `app-edge-has-no-entrypoint`) here, while webpack writes a real .js
      // path; either way the actual bundle files come from the
      // middleware-manifest entry.
      routes.push({
        type,
        route,
        runtime: { kind: 'edge', files: edge.files },
      })
    } else if (entry.endsWith('.js')) {
      routes.push({
        type,
        route,
        runtime: { kind: 'node', serverEntry: entry },
      })
    }
  }
  return routes
}

function discoverMiddleware(
  middleware: Record<string, MiddlewareManifestEntry>
): RouteEntry[] {
  // The middleware manifest keys an entry by `/` for the project's
  // `middleware.ts`. We use the entry's `name` (e.g. "middleware") as the
  // displayed route, since `/` would collide with an app-page at "/".
  return Object.entries(middleware).map(([key, def]) => ({
    type: 'middleware' as const,
    route: def.name ?? key,
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
 *   - `.map` files → `serverMaps` (regardless of in/out of distDir)
 *   - other `.js` files inside distDir → `serverBundled` (server chunks)
 *   - any other file outside distDir → `serverUnbundled` (traced node_modules
 *     and other on-disk deps the server entry needs at runtime)
 *
 * Files inside distDir that are neither `.js` nor `.map` (e.g. `.json`
 * manifests, `_client-reference-manifest.js`) are skipped — they're either
 * bundler bookkeeping or already accounted for elsewhere.
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
    const outsideDistDir = inDistDirPath.startsWith('..')
    const isMap = inDistDirPath.endsWith('.map')
    if (isMap) {
      // Source maps go into the maps category whether they're in or outside
      // distDir, so they don't double-count under serverUnbundled.
      sets.serverMaps.add(
        outsideDistDir ? path.resolve(entryDirAbs, relPath) : inDistDirPath
      )
    } else if (outsideDistDir) {
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
 * The file is a JS module that assigns a JSON object to a global. The exact
 * shape varies by bundler:
 *
 *   Turbopack (with optional suffix that re-writes `clientModules[k] = val`
 *   when a deployment ID is set):
 *     globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
 *     globalThis.__RSC_MANIFEST["/page"] = {...};
 *     for (const key in globalThis.__RSC_MANIFEST["/page"].clientModules) {
 *       globalThis.__RSC_MANIFEST["/page"].clientModules[key] = val;
 *       ...
 *     }
 *
 *   Webpack (no spaces around `=`, single line):
 *     globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["/page"]={...};
 *
 * Rather than evaluating user-bundled code, locate the FIRST
 * `globalThis.__RSC_MANIFEST[` occurrence (which is always the entry-key
 * assignment — the `MANIFEST = MANIFEST || {}` boilerplate has no `[`
 * after the global). Then properly walk the JS string literal that holds
 * the entry name (handling escapes), so route names containing `]` —
 * e.g. dynamic segments like `[teamSlug]` or route groups inside dynamic
 * params — don't terminate the bracket early. After the closing `]` we
 * expect `=` then `{`, and balance-walk the object body.
 *
 * Returns `null` only when the file doesn't exist (a normal case for
 * server entries that have no client-reference manifest, e.g. middleware
 * or non-app routes). Any structural surprise — manifest header missing,
 * unterminated string/object, or invalid JSON — throws so we never
 * silently undercount client JS/CSS.
 */
function parseClientReferenceManifest(filePath: string): {
  entryJSFiles?: Record<string, string[]>
  entryCSSFiles?: Record<string, Array<string | { path: string }>>
  clientModules?: Record<string, { chunks?: unknown[] }>
} | null {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }

  const ANCHOR = 'globalThis.__RSC_MANIFEST['
  const anchorIdx = content.indexOf(ANCHOR)
  if (anchorIdx === -1) {
    throw new Error(
      `Could not find 'globalThis.__RSC_MANIFEST[' in ${filePath}; client reference manifest format may have changed.`
    )
  }

  // Walk a JS string literal starting at `i` (which must point at the
  // opening quote). Returns the index just past the closing quote.
  const skipString = (i: number): number => {
    const quote = content[i]
    if (quote !== '"' && quote !== "'") {
      throw new Error(
        `Expected string literal as entry name in ${filePath} at offset ${i}, got ${JSON.stringify(content[i])}.`
      )
    }
    i++
    let escape = false
    while (i < content.length) {
      const ch = content[i]
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === quote) {
        return i + 1
      }
      i++
    }
    throw new Error(`Unterminated entry-name string literal in ${filePath}.`)
  }

  // Skip whitespace forward from `i` and assert the next char is `expected`.
  const expectChar = (i: number, expected: string): number => {
    while (i < content.length && /\s/.test(content[i])) i++
    if (content[i] !== expected) {
      throw new Error(
        `Expected '${expected}' after entry name in ${filePath} at offset ${i}, got ${JSON.stringify(content[i] ?? '<eof>')}.`
      )
    }
    return i + 1
  }

  // After `globalThis.__RSC_MANIFEST[` walk: <string> ] = {
  let i = skipString(anchorIdx + ANCHOR.length)
  i = expectChar(i, ']')
  i = expectChar(i, '=')
  while (i < content.length && /\s/.test(content[i])) i++
  if (content[i] !== '{') {
    throw new Error(
      `Expected '{' after 'globalThis.__RSC_MANIFEST[...] =' in ${filePath} at offset ${i}, got ${JSON.stringify(content[i] ?? '<eof>')}.`
    )
  }

  // Balance-walk `{...}`, ignoring `{` / `}` inside string literals so a
  // CSS path like "{foo}" inside JSON doesn't throw the count off.
  const start = i
  let depth = 0
  let inString = false
  let quote = ''
  let escape = false
  for (; i < content.length; i++) {
    const ch = content[i]
    if (inString) {
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === quote) {
        inString = false
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      quote = ch
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        const body = content.slice(start, i + 1)
        try {
          return JSON.parse(body)
        } catch (err) {
          throw new Error(
            `Failed to parse JSON body of ${filePath}: ${(err as Error).message}`
          )
        }
      }
    }
  }
  throw new Error(`Unterminated JSON object in ${filePath}.`)
}

/**
 * Add a chunk path to the right client-side category. Strips a `?dpl=...`
 * (or any other) query suffix that webpack appends, then dispatches by
 * extension. Returns true if the path looked like a real asset (had an
 * extension we recognize) — used by the webpack `clientModules` walker
 * below to filter out chunk IDs.
 */
function addClientChunk(rawPath: string, sets: FileSets): boolean {
  // Some manifests append `?dpl=ID` to chunk URLs.
  const cleaned = stripNextPrefix(rawPath).split('?')[0]
  if (cleaned.endsWith('.map')) sets.clientMaps.add(cleaned)
  else if (cleaned.endsWith('.css')) sets.clientCss.add(cleaned)
  else if (cleaned.endsWith('.js')) sets.clientJs.add(cleaned)
  else return false
  return true
}

/**
 * Collect client JS chunks and CSS files for an App Router page/route.
 * Source priority:
 *   1. `entryJSFiles` from the route's `_client-reference-manifest.js`
 *      (Turbopack-only field — explicit list of all JS files needed for
 *      the entry's segments).
 *   2. As a fallback, walk `clientModules[*].chunks` (the canonical client-
 *      reference list, populated by both bundlers). This picks up the
 *      chunks for any actual `'use client'` components imported by the
 *      route. Note webpack interleaves chunkIds with file names — the
 *      extension filter in `addClientChunk` skips the IDs.
 *
 * Plus `entryCSSFiles` for CSS, and the per-route `build-manifest.json`
 * (Turbopack only) for shared App Router root chunks.
 *
 * `.map` paths are routed to `clientMaps`, `.css` to `clientCss`, `.js` to
 * `clientJs` — anything else is dropped.
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
    if (crm.entryJSFiles) {
      // Turbopack: explicit per-segment chunk list.
      for (const chunks of Object.values(crm.entryJSFiles)) {
        for (const chunk of chunks) addClientChunk(chunk, sets)
      }
    } else if (crm.clientModules) {
      // Webpack: no entryJSFiles — walk clientModules. Each entry's
      // `chunks` array is `[chunkId, fileName, chunkId, fileName, ...]`
      // (alternating). `addClientChunk` filters by extension so chunkIds
      // (which have no extension) are dropped automatically.
      for (const mod of Object.values(crm.clientModules)) {
        for (const chunk of mod.chunks ?? []) {
          if (typeof chunk === 'string') addClientChunk(chunk, sets)
        }
      }
    }
    for (const cssFiles of Object.values(crm.entryCSSFiles ?? {})) {
      for (const css of cssFiles) {
        const cssPath = typeof css === 'string' ? css : css.path
        if (cssPath) addClientChunk(cssPath, sets)
      }
    }
  }

  // Add the App Router framework / main-app chunks shared across every
  // app-page. Both bundlers list them in the global `build-manifest.json`
  // under `rootMainFiles`. Turbopack also writes a per-route
  // `build-manifest.json` containing the same files; webpack does not.
  const globalBm = readJsonFile<{ rootMainFiles?: string[] }>(
    path.join(distDir, 'build-manifest.json')
  )
  for (const chunk of globalBm?.rootMainFiles ?? []) addClientChunk(chunk, sets)
}

/**
 * Collect client JS for a Pages Router route. The global `build-manifest.json`
 * lists each page's chunks (`pages[route]`), the shared baseline (`/_app`),
 * and `polyfillFiles`. Per-page CSS is not tracked in the Pages build output,
 * so it's not collected here. `.map` paths are routed to `clientMaps`
 * defensively.
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
  for (const chunk of chunks) {
    if (chunk.endsWith('.map')) sets.clientMaps.add(chunk)
    else sets.clientJs.add(chunk)
  }
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
 *
 * `urlCache` memoizes the trailer read across routes: a chunk shared by N
 * routes is only opened once.
 */
function deriveSourceMaps(
  distDir: string,
  source: Set<string>,
  target: Set<string>,
  urlCache: Map<string, string | null>
): void {
  for (const f of source) {
    const fullPath = path.isAbsolute(f) ? f : path.join(distDir, f)
    let mapFromUrl = urlCache.get(fullPath)
    if (mapFromUrl === undefined) {
      mapFromUrl = readSourceMappingURL(fullPath)
      urlCache.set(fullPath, mapFromUrl)
    }
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
    const adjacentFull = path.isAbsolute(adjacent)
      ? adjacent
      : path.join(distDir, adjacent)
    if (fs.existsSync(adjacentFull)) target.add(adjacent)
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

/**
 * Collect bundled `.js` files for an edge runtime entry. Edge bundles don't
 * have a `.nft.json`; their files are listed inline by middleware-manifest.
 * `.map` files are routed to `serverMaps` so they don't pollute the bundle
 * count; other extensions (manifest .json siblings) are dropped.
 */
function collectEdgeFiles(files: string[], sets: FileSets): void {
  for (const f of files) {
    if (f.endsWith('.js')) sets.serverBundled.add(f)
    else if (f.endsWith('.map')) sets.serverMaps.add(f)
  }
}

/** Collect all 6 file-sets for a single route. */
function collectFiles(
  distDir: string,
  entry: RouteEntry,
  urlCache: Map<string, string | null>
): FileSets {
  const sets = emptyFileSets()

  switch (entry.type) {
    case 'middleware':
      // Middleware always runs in the edge runtime; same shape as edge
      // route handlers (inline files list).
      collectEdgeFiles(entry.files, sets)
      break
    case 'pages-static':
      collectPagesClientFiles(distDir, entry.route, sets)
      break
    case 'pages':
    case 'pages-api':
    case 'app-page':
    case 'app-route':
      // Server bundle: node entries are traced via .nft.json; edge entries
      // list their bundle files directly in the middleware-manifest.
      if (entry.runtime.kind === 'node') {
        collectServerEntryFiles(distDir, entry.runtime.serverEntry, sets)
      } else {
        collectEdgeFiles(entry.runtime.files, sets)
      }
      // Client-side: pages-router uses the global build-manifest;
      // app-router pages use the per-route _client-reference-manifest plus
      // shared `rootMainFiles` from the global build-manifest. App-router
      // route handlers (`app-route`) and edge runtime entries don't ship
      // client JS — skip client collection there.
      if (entry.type === 'pages') {
        collectPagesClientFiles(distDir, entry.route, sets)
      } else if (entry.type === 'app-page' && entry.runtime.kind === 'node') {
        collectAppClientFiles(distDir, entry.runtime.serverEntry, sets)
      }
      break
    default:
      // Exhaustiveness check — TS will error here if a new RouteEntry
      // variant is added without a matching case.
      entry satisfies never
  }

  // Source maps for everything we collected above. Both .js.map and
  // .css.map files are picked up by reading the `sourceMappingURL`
  // trailer of each source file.
  deriveSourceMaps(distDir, sets.serverBundled, sets.serverMaps, urlCache)
  deriveSourceMaps(distDir, sets.clientJs, sets.clientMaps, urlCache)
  deriveSourceMaps(distDir, sets.clientCss, sets.clientMaps, urlCache)

  return sets
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/**
 * File-size cache, keyed by the stored path string (relative to `distDir`
 * for in-distDir files, absolute otherwise). `null` means the path doesn't
 * resolve to a regular file (symlink, missing, directory, etc.) and should
 * be excluded from counts.
 *
 * A single shared cache covers all categories: a path appears in only one
 * category by design, but using one map keeps the API simple and ensures we
 * stat each unique file at most once across the whole tool run.
 */
type SizeCache = Map<string, number | null>

/**
 * Stat every unique file across every route's file sets and cache the size.
 * Symlinks and non-files (directories, etc.) are recorded as `null` so we
 * don't re-stat and so they're excluded from later counts.
 */
function buildSizeCache(distDir: string, allFileSets: FileSets[]): SizeCache {
  const cache: SizeCache = new Map()
  for (const sets of allFileSets) {
    for (const cat of CATEGORIES) {
      for (const f of sets[cat]) {
        if (cache.has(f)) continue
        const fullPath = path.isAbsolute(f) ? f : path.join(distDir, f)
        try {
          const stat = fs.lstatSync(fullPath)
          cache.set(
            f,
            stat.isFile() && !stat.isSymbolicLink() ? stat.size : null
          )
        } catch {
          cache.set(f, null)
        }
      }
    }
  }
  return cache
}

/** Sum sizes for the files in `set` using the precomputed cache. */
function measureFromCache(set: Set<string>, cache: SizeCache): CategoryStats {
  let count = 0
  let bytes = 0
  for (const f of set) {
    const size = cache.get(f)
    if (size != null) {
      count++
      bytes += size
    }
  }
  return { count, bytes }
}

function measureFileSets(sets: FileSets, cache: SizeCache): CategoryStatsByKey {
  const result = {} as CategoryStatsByKey
  for (const cat of CATEGORIES) {
    result[cat] = measureFromCache(sets[cat], cache)
  }
  return result
}

/**
 * For each category, compute the average size of the intersection of this
 * route's files with each peer route's files (a "peer" is another route of
 * the same `type`). Returns `null` per category if there are no peers.
 *
 * Files counted multiple times across peers contribute to the average each
 * time — e.g. if a chunk is shared with all 5 peers, it contributes 5×size
 * to the sum, then we divide by 5 to get the average.
 */
function measureSharedAvg(
  routeIndex: number,
  allFileSets: FileSets[],
  routeEntries: RouteEntry[],
  cache: SizeCache
): Record<Category, CategoryStats | null> {
  const myType = routeEntries[routeIndex].type
  const peers: number[] = []
  for (let j = 0; j < routeEntries.length; j++) {
    if (j !== routeIndex && routeEntries[j].type === myType) peers.push(j)
  }

  const result = {} as Record<Category, CategoryStats | null>
  for (const cat of CATEGORIES) {
    if (peers.length === 0) {
      result[cat] = null
      continue
    }
    const mySet = allFileSets[routeIndex][cat]
    let sumCount = 0
    let sumBytes = 0
    for (const j of peers) {
      const peerSet = allFileSets[j][cat]
      // Iterate the smaller set and probe the larger; saves work when sizes
      // differ a lot (e.g. an empty serverUnbundled vs a big one).
      const [small, big] =
        mySet.size <= peerSet.size ? [mySet, peerSet] : [peerSet, mySet]
      for (const f of small) {
        if (!big.has(f)) continue
        const size = cache.get(f)
        if (size != null) {
          sumCount++
          sumBytes += size
        }
      }
    }
    result[cat] = {
      count: sumCount / peers.length,
      bytes: sumBytes / peers.length,
    }
  }
  return result
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

/**
 * Compute the byte total a route should be ordered by, for a given sort key.
 * `name` is special-cased by the caller; every other key returns a numeric
 * total that sorts descending.
 */
function sortValue(r: RouteInfo, key: Exclude<SortKey, 'name'>): number {
  switch (key) {
    case 'client':
      return r.clientJs.bytes + r.clientCss.bytes
    case 'client-js':
      return r.clientJs.bytes
    case 'client-css':
      return r.clientCss.bytes
    case 'client-map':
      return r.clientMaps.bytes
    case 'server':
      return r.serverBundled.bytes + r.serverUnbundled.bytes
    case 'server-bundled-js':
      return r.serverBundled.bytes
    case 'server-unbundled':
      return r.serverUnbundled.bytes
    case 'server-map':
      return r.serverMaps.bytes
    case 'total':
      return totalBytes(r)
    default:
      key satisfies never
      throw new Error(`unreachable sort key: ${key as string}`)
  }
}

/**
 * Sort `routes` in-place by the given key. `name` sorts ascending
 * alphabetically; every other key sorts descending by byte total, with a
 * stable tiebreaker on the route name (so two routes with identical sizes
 * always appear in the same order).
 */
function sortRoutes(routes: RouteInfo[], key: SortKey): void {
  if (key === 'name') {
    routes.sort((a, b) => a.route.localeCompare(b.route))
    return
  }
  routes.sort(
    (a, b) =>
      sortValue(b, key) - sortValue(a, key) || a.route.localeCompare(b.route)
  )
}

/**
 * Convert an internal path to one expressed relative to `distDir`. Paths
 * already relative are passed through; absolute paths (traced node_modules
 * deps) are rewritten so the output JSON is independent of the user's
 * absolute filesystem layout.
 */
function toDistRelative(distDir: string, p: string): string {
  return path.isAbsolute(p) ? path.relative(distDir, p) : p
}

/**
 * Sorted, dist-relative file list for a single category, used when
 * `--files` is enabled. Entries with `null` in the size cache (symlinks,
 * directories, missing files) are filtered out so the list stays in sync
 * with `count` (which excludes them too). Sorting keeps JSON output
 * deterministic across runs / platforms.
 */
function fileListFor(
  distDir: string,
  set: Set<string>,
  sizeCache: SizeCache
): string[] {
  const out: string[] = []
  for (const p of set) {
    if (sizeCache.get(p) != null) out.push(toDistRelative(distDir, p))
  }
  return out.sort()
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(2) + ' KB'
  return Math.round(n) + ' B'
}

/** File counts can be fractional in averages — print 1 decimal in that case. */
function formatCount(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1)
}

function formatCell(stats: CategoryStats): string {
  // Render empty cells as `-` rather than `0 files / 0 B`. The vast
  // majority of cells in a typical app have *some* content for every
  // category — when a cell IS empty (e.g. a route handler ships no client
  // JS) the placeholder makes the table much easier to scan visually
  // because non-zero values stand out.
  if (stats.count === 0 && stats.bytes === 0) return '-'
  return `${formatCount(stats.count)} files / ${formatBytes(stats.bytes)}`
}

/**
 * Cell for the "Shared" table: returns "n/a" if a route has no peers (i.e.
 * `stats` is `null`), otherwise the same `count files / bytes` rendering as
 * the routes table, augmented with the percentage of own count/bytes that
 * the average shared portion represents — e.g. `5 files (83%) / 1.2 MB (40%)`.
 *
 * Empty intersections render as `-` for the same readability reason as
 * `formatCell`. `n/a` (no peers) is preserved separately because it has a
 * different meaning from "shared with peers but the intersection is empty".
 */
function formatSharedCell(stats: SharedStats | null): string {
  if (stats == null) return 'n/a'
  if (stats.count === 0 && stats.bytes === 0) return '-'
  return (
    `${formatCount(stats.count)} files (${Math.round(stats.percentCount)}%)` +
    ` / ${formatBytes(stats.bytes)} (${Math.round(stats.percentBytes)}%)`
  )
}

/**
 * Compute the percent-shared annotation for a (own, sharedAvg) pair.
 * Returns `null` unchanged when the route has no peers; otherwise extends
 * the raw {count, bytes} averages with `percentCount` and `percentBytes`.
 * Avoids 0/0 by returning 0 when own.count or own.bytes is 0 (the
 * intersection of an empty set with anything is also 0, so 0% is a
 * coherent answer rather than NaN).
 */
function annotateShared(
  own: CategoryStats,
  shared: CategoryStats | null
): SharedStats | null {
  if (shared == null) return null
  return {
    count: shared.count,
    bytes: shared.bytes,
    percentCount: own.count > 0 ? (shared.count / own.count) * 100 : 0,
    percentBytes: own.bytes > 0 ? (shared.bytes / own.bytes) * 100 : 0,
  }
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

  // Shared (averaged across peers of same type) — printed in the same row
  // order as the routes table. Routes with no peers show `n/a`.
  const sharedRows = routes.map((r) => [
    r.route,
    r.type,
    ...CATEGORIES.map((c) => formatSharedCell(r[c].sharedAvg)),
  ])
  console.log('\n## Shared (avg per other route of same type)\n')
  console.log(
    renderMarkdownTable(['Route', 'Type', ...categoryHeaders], sharedRows)
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
  // Validate options up front so we fail fast with a clear error before
  // doing any expensive work (loading config, reading manifests).
  const sortKey: SortKey = options.sort
    ? (SORT_KEYS as readonly string[]).includes(options.sort)
      ? (options.sort as SortKey)
      : (() => {
          console.error(
            `Error: invalid --sort key '${options.sort}'. Valid keys: ${SORT_KEYS.join(', ')}.`
          )
          process.exit(1)
        })()
    : 'name'
  if (options.files && !options.json) {
    console.error('Error: --files requires --json.')
    process.exit(1)
  }

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

  // Step 1+2: capture per-route files (sets implicitly deduplicate). The
  // `urlCache` memoizes `sourceMappingURL` reads — a chunk shared by N
  // routes only opens its file once.
  const routeEntries = discoverRoutes(distDir)
  const urlCache = new Map<string, string | null>()
  const allFileSets = routeEntries.map((entry) =>
    collectFiles(distDir, entry, urlCache)
  )

  // Step 3a: stat every unique file once and cache the size, so per-route
  // measurement and shared-avg calculation don't repeat syscalls.
  const sizeCache = buildSizeCache(distDir, allFileSets)

  // Step 3b: measure per-route. Each category also carries a `sharedAvg`
  // against its same-type peers; under `--files` it also carries the
  // dist-relative file list that contributed to the metric.
  const routeInfos: RouteInfo[] = routeEntries.map((entry, i) => {
    const stats = measureFileSets(allFileSets[i], sizeCache)
    const shared = measureSharedAvg(i, allFileSets, routeEntries, sizeCache)
    const merged = {} as CategoryStatsWithSharedByKey
    for (const cat of CATEGORIES) {
      merged[cat] = {
        ...stats[cat],
        sharedAvg: annotateShared(stats[cat], shared[cat]),
      }
      if (options.files) {
        merged[cat].files = fileListFor(distDir, allFileSets[i][cat], sizeCache)
      }
    }
    return { route: entry.route, type: entry.type, ...merged }
  })
  sortRoutes(routeInfos, sortKey)

  // Project-wide totals — union of all route sets, regardless of --limit.
  const mergedSets = mergeSets(allFileSets)
  const totals = measureFileSets(mergedSets, sizeCache)
  if (options.files) {
    for (const cat of CATEGORIES) {
      totals[cat].files = fileListFor(distDir, mergedSets[cat], sizeCache)
    }
  }

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
