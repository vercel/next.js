import { AnalyzeData, type SourceIndex } from './analyze-data'
import { formatBytes } from './utils'

/**
 * Formats a byte delta with an explicit sign (or `±0` for no change). Used
 * by the diff table and route picker to render compact change indicators.
 */
export function formatDelta(deltaBytes: number): string {
  if (deltaBytes === 0) return '±0'
  const sign = deltaBytes > 0 ? '+' : '−'
  return `${sign}${formatBytes(Math.abs(deltaBytes))}`
}

/**
 * Represents how a row (route, source, etc.) changed between two builds.
 *
 * - `added`: present in `B` (the latest build) only
 * - `removed`: present in `A` (the historical build) only
 * - `changed`: present in both, but the size delta is non-zero
 * - `identical`: present in both with no size change
 */
export type DiffStatus = 'added' | 'removed' | 'changed' | 'identical'

/**
 * Per-row diff entry: one logical thing (a route, a source path) compared
 * across two builds.
 *
 * Sizes are all measured in bytes. We carry both compressed and raw sizes
 * because the existing UI exposes both modes — comparison should respect the
 * user's choice.
 */
export interface DiffRow {
  /** Stable join key (route path or full source path). */
  key: string
  /** Display label. For routes, same as `key`. For sources, the basename or relative-to-project segment. */
  name: string
  status: DiffStatus
  /** Size in build A (the historical baseline). 0 when added. */
  sizeA: number
  /** Size in build B (the latest build). 0 when removed. */
  sizeB: number
  /** Compressed size in build A. */
  compressedA: number
  /** Compressed size in build B. */
  compressedB: number
}

/**
 * Aggregate totals + categorized rows for a build comparison.
 */
export interface DiffSummary<Row extends DiffRow = DiffRow> {
  rows: Row[]
  /** Counts by status, useful for headline badges. */
  counts: Record<DiffStatus, number>
  /** Sum of `sizeA` over all rows. */
  totalA: number
  /** Sum of `sizeB` over all rows. */
  totalB: number
  /** Sum of `compressedA` over all rows. */
  totalCompressedA: number
  /** Sum of `compressedB` over all rows. */
  totalCompressedB: number
}

/** Returns `B - A` for a row. */
export function delta(row: DiffRow, useCompressed: boolean): number {
  return useCompressed
    ? row.compressedB - row.compressedA
    : row.sizeB - row.sizeA
}

/** Returns the status for a row given the two sizes. */
function statusFor(
  sizeA: number,
  sizeB: number,
  presentInA: boolean,
  presentInB: boolean
): DiffStatus {
  if (presentInA && !presentInB) return 'removed'
  if (!presentInA && presentInB) return 'added'
  if (sizeA === sizeB) return 'identical'
  return 'changed'
}

/** Builds an empty {@link DiffSummary}. */
function emptySummary<Row extends DiffRow>(): DiffSummary<Row> {
  return {
    rows: [],
    counts: { added: 0, removed: 0, changed: 0, identical: 0 },
    totalA: 0,
    totalB: 0,
    totalCompressedA: 0,
    totalCompressedB: 0,
  }
}

/** Adds a row to a summary, updating counts and totals. */
function pushRow<Row extends DiffRow>(
  summary: DiffSummary<Row>,
  row: Row
): void {
  summary.rows.push(row)
  summary.counts[row.status] += 1
  summary.totalA += row.sizeA
  summary.totalB += row.sizeB
  summary.totalCompressedA += row.compressedA
  summary.totalCompressedB += row.compressedB
}

/**
 * Diffs two route lists. Routes are compared by their page path. Without
 * per-route data loaded (which would be N round-trips), the size columns are
 * left at zero; the table view fills them in lazily as the user expands rows.
 */
export function diffRouteLists(
  routesA: string[] | null,
  routesB: string[]
): DiffSummary {
  const summary = emptySummary()
  const setA = new Set(routesA ?? [])
  const setB = new Set(routesB)
  const all = new Set<string>([...setA, ...setB])
  const sorted = Array.from(all).sort()

  for (const route of sorted) {
    const inA = setA.has(route)
    const inB = setB.has(route)
    pushRow(summary, {
      key: route,
      name: route,
      status: statusFor(0, 0, inA, inB),
      sizeA: 0,
      sizeB: 0,
      compressedA: 0,
      compressedB: 0,
    })
  }

  return summary
}

/**
 * Per-route size aggregates contributed by a single side (A or B). When a
 * route is missing from the corresponding map entirely, it's treated as
 * "not present in that build".
 */
export interface RouteSizeTotals {
  size: number
  compressedSize: number
}

/**
 * Sums the `getOwnSizes` of every leaf source in an {@link AnalyzeData},
 * giving a single route's total contribution. This matches what the existing
 * route sidebar shows for each route in non-compare mode.
 */
export function totalsFromAnalyzeData(
  data: AnalyzeData,
  filter?: (sourceIndex: SourceIndex) => boolean
): RouteSizeTotals {
  let size = 0
  let compressedSize = 0
  const count = data.sourceCount()
  for (let i = 0; i < count; i++) {
    if (data.sourceChildren(i).length > 0) continue
    if (filter && !filter(i)) continue
    const own = data.getOwnSizes(i)
    size += own.size
    compressedSize += own.compressedSize
  }
  return { size, compressedSize }
}

/**
 * Size-aware variant of {@link diffRouteLists}. When `sizesA`/`sizesB` are
 * provided, routes get real `changed`/`identical` classification based on
 * their summed source sizes — not just name-presence.
 *
 * A route is `added` if it is missing from `sizesA`, `removed` if missing
 * from `sizesB`. `sizesA == null` means the baseline is still loading and we
 * fall back to the name-only diff (`diffRouteLists`).
 */
export function diffRoutesWithSizes(
  routesA: string[] | null,
  routesB: string[],
  sizesA: ReadonlyMap<string, RouteSizeTotals> | null,
  sizesB: ReadonlyMap<string, RouteSizeTotals>
): DiffSummary {
  if (!sizesA) return diffRouteLists(routesA, routesB)

  const summary = emptySummary()
  const setA = new Set(routesA ?? [])
  const setB = new Set(routesB)
  const all = new Set<string>([...setA, ...setB])
  const sorted = Array.from(all).sort()

  for (const route of sorted) {
    const a = sizesA.get(route)
    const b = sizesB.get(route)
    const inA = setA.has(route)
    const inB = setB.has(route)
    const sizeA = a?.size ?? 0
    const sizeB = b?.size ?? 0
    pushRow(summary, {
      key: route,
      name: route,
      status: statusFor(sizeA, sizeB, inA, inB),
      sizeA,
      sizeB,
      compressedA: a?.compressedSize ?? 0,
      compressedB: b?.compressedSize ?? 0,
    })
  }

  return summary
}

/**
 * A {@link DiffRow} for a source (file or module), including the indices we
 * need to look it back up in either side's {@link AnalyzeData}.
 */
export interface SourceDiffRow extends DiffRow {
  sourceIndexA: SourceIndex | null
  sourceIndexB: SourceIndex | null
  /**
   * Whether the source lives in an npm package (`package`) or is part of the
   * user's project (`project`). Used by the diff table to pick an icon.
   */
  pathKind: 'package' | 'project'
  /** Resolved npm package name when `pathKind === 'package'`. */
  packageName?: string
  /**
   * Environment flags reflecting where the leaf is bundled. Mirrors what
   * the treemap hover footer already shows. Computed via
   * `AnalyzeData.getSourceFlags` at diff time so the table can render
   * `client` / `server` badges without re-deriving them per row.
   *
   * Both flags can be `true` simultaneously (a source can be pulled into
   * both client and server bundles).
   */
  client: boolean
  server: boolean
}

interface SourceDiffOptions {
  /** When provided, sources for which `filterSource(side, index) === false` are excluded. */
  filterSource?: (side: 'A' | 'B', index: SourceIndex) => boolean
}

/**
 * Per-side leaf entry as collected from an {@link AnalyzeData}. The
 * `index` points back into that side's data so callers (e.g. the sidebar
 * import-chain panel) can resolve the original source.
 */
interface LeafEntry {
  index: SourceIndex
  size: number
  compressedSize: number
  /** Bundled into the client environment. */
  client: boolean
  /** Bundled into the server environment. */
  server: boolean
}

/**
 * Walks every leaf source in `data` (skipping directory aggregations and
 * empty contributions) and returns them keyed by full path.
 */
function collectLeaves(
  side: 'A' | 'B',
  data: AnalyzeData,
  options: SourceDiffOptions
): Map<string, LeafEntry> {
  const out = new Map<string, LeafEntry>()
  const count = data.sourceCount()
  for (let i = 0; i < count; i++) {
    // Only include leaf sources (real files, not directory aggregations).
    if (data.sourceChildren(i).length > 0) continue
    if (options.filterSource && !options.filterSource(side, i)) continue
    const fullPath = data.getFullSourcePath(i)
    if (!fullPath) continue
    const own = data.getOwnSizes(i)
    // Skip empty contributions — they aren't really "in" the bundle.
    if (own.size === 0 && own.compressedSize === 0) continue
    const flags = data.getSourceFlags(i)
    out.set(fullPath, {
      index: i,
      size: own.size,
      compressedSize: own.compressedSize,
      client: flags.client,
      server: flags.server,
    })
  }
  return out
}

/**
 * Diffs every source between two analyze datasets, joining by full source
 * path (stable across builds modulo file moves).
 *
 * Directories (sources with children) are excluded — only leaf "files" appear
 * in the resulting rows. Their own size is the sum of their {@link
 * AnalyzeData.sourceChunkParts} contributions.
 */
export function diffSources(
  analyzeA: AnalyzeData | null,
  analyzeB: AnalyzeData,
  options: SourceDiffOptions = {}
): DiffSummary<SourceDiffRow> {
  const summary = emptySummary<SourceDiffRow>()

  const leavesA = analyzeA
    ? collectLeaves('A', analyzeA, options)
    : new Map<string, LeafEntry>()
  const leavesB = collectLeaves('B', analyzeB, options)

  const allKeys = new Set<string>([...leavesA.keys(), ...leavesB.keys()])
  for (const key of allKeys) {
    const a = leavesA.get(key)
    const b = leavesB.get(key)
    const pretty = prettifySourcePath(key)
    pushRow(summary, {
      key,
      name: pretty.display,
      status: statusFor(
        a?.size ?? 0,
        b?.size ?? 0,
        a !== undefined,
        b !== undefined
      ),
      sizeA: a?.size ?? 0,
      sizeB: b?.size ?? 0,
      compressedA: a?.compressedSize ?? 0,
      compressedB: b?.compressedSize ?? 0,
      sourceIndexA: a?.index ?? null,
      sourceIndexB: b?.index ?? null,
      pathKind: pretty.kind,
      packageName: pretty.packageName,
      // OR-merge env flags across both sides so the badge reflects the
      // row's overall environment(s). A source that's client-only in A
      // and removed in B is still "client" for the purpose of the row.
      client: (a?.client ?? false) || (b?.client ?? false),
      server: (a?.server ?? false) || (b?.server ?? false),
    })
  }

  return summary
}

/**
 * Returns a short, human-friendly version of a source path for table /
 * treemap labels. Source paths look like:
 *
 *   `[project]/app/page.tsx`
 *   `[client-fs]/node_modules/react/index.js`
 *   `[turbopack]/...`
 *
 * For UI purposes the `[bracket]/` prefix is noise — keep the rest.
 */
export function shortenSourcePath(fullPath: string): string {
  const pretty = prettifySourcePath(fullPath)
  return pretty.display
}

/**
 * Result of {@link prettifySourcePath}. Tells the UI both how to render the
 * path (`display`) and whether it points into an npm package (so callers can
 * add a package icon, etc.).
 */
export interface PrettySourcePath {
  /** Discriminator the UI uses to decide on iconography. */
  kind: 'package' | 'project'
  /** Human-friendly path. For packages: `<pkg>/<rest>`. */
  display: string
  /** Resolved npm package name, when `kind === 'package'`. */
  packageName?: string
}

/**
 * Picks a clean, scannable display path for a source. Handles three cases:
 *
 * 1. **pnpm-encoded paths** like
 *    `node_modules/.pnpm/react@19.2.4/node_modules/react/index.js` —
 *    we collapse all the `.pnpm/...` virtual store noise and report
 *    `react/index.js` as the display path.
 * 2. **Plain `node_modules/<pkg>/...` paths** — same treatment, just without
 *    the virtual store layer.
 * 3. **Project-relative paths** (e.g. `app/page.tsx`) — pass through unchanged
 *    after stripping the `[project]/` prefix that {@link shortenSourcePath}
 *    used to handle.
 *
 * The full path is always preserved on the original row's `key` so the UI can
 * surface it via `title=` for power-users.
 */
export function prettifySourcePath(fullPath: string): PrettySourcePath {
  // Strip Turbopack's `[bracket]/` source-root prefix.
  const stripped = fullPath.replace(/^\[[^\]]+\]\//, '') || fullPath

  // Walk every `node_modules/<segment>/` occurrence and pick the *last* one —
  // that's where the real package name lives. pnpm produces paths shaped like
  // `node_modules/.pnpm/<encoded>/node_modules/<pkg>/...`, where the inner
  // `node_modules/<pkg>` is the real entry point.
  const nm = 'node_modules/'
  let lastNmIndex = -1
  for (
    let idx = stripped.indexOf(nm);
    idx !== -1;
    idx = stripped.indexOf(nm, idx + nm.length)
  ) {
    lastNmIndex = idx
  }
  if (lastNmIndex !== -1) {
    const after = stripped.slice(lastNmIndex + nm.length)
    // The package name is one or two path segments depending on whether it's
    // scoped: `@scope/name/...` vs `name/...`. Anything after that is the
    // path within the package.
    const segments = after.split('/')
    if (segments.length > 0 && segments[0]) {
      const isScoped = segments[0].startsWith('@')
      const pkgSegments = isScoped ? segments.slice(0, 2) : segments.slice(0, 1)
      const restSegments = segments.slice(pkgSegments.length)
      const packageName = pkgSegments.join('/')
      // Skip pnpm's `.pnpm` virtual-store entry — we only treat real packages
      // (not the `.pnpm` directory itself) as packages.
      if (packageName && packageName !== '.pnpm') {
        const display =
          restSegments.length > 0
            ? `${packageName}/${restSegments.join('/')}`
            : packageName
        return { kind: 'package', display, packageName }
      }
    }
  }

  return { kind: 'project', display: stripped }
}

/**
 * Sorts diff rows by absolute delta (largest impact first), with a stable
 * tiebreaker on key. Identical rows always sort last.
 */
export function sortByImpact<Row extends DiffRow>(
  rows: Row[],
  useCompressed: boolean
): Row[] {
  return [...rows].sort((a, b) => {
    if (a.status === 'identical' && b.status !== 'identical') return 1
    if (b.status === 'identical' && a.status !== 'identical') return -1
    const da = Math.abs(delta(a, useCompressed))
    const db = Math.abs(delta(b, useCompressed))
    if (da !== db) return db - da
    return a.key < b.key ? -1 : 1
  })
}
