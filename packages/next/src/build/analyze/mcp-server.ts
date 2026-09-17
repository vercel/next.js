import type { AnalyzeData, ModulesData } from '../../shared/lib/analyze-data'
import type { SnapshotMetadata } from './snapshot'
import type { AnalyzeRepository } from './repository'
import z from 'next/dist/compiled/zod'

const { McpServer } =
  require('next/dist/compiled/@modelcontextprotocol/sdk/server/mcp') as typeof import('next/dist/compiled/@modelcontextprotocol/sdk/server/mcp')

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const MAX_CHUNKS = 100
const MAX_MODULE_CANDIDATES = 100
const MAX_GRAPH_NODES = 10_000
const COMPRESSED_CAVEAT =
  'Compressed source sizes are estimates because attributed parts are compressed independently.'
const ENTRY_HEURISTIC_CAVEAT =
  'Route entries are detected heuristically from internal Next.js module identifiers.'

type Environment = 'total' | 'client' | 'server'
type Metric = 'raw' | 'compressed'
type FileType = 'js' | 'css' | 'json' | 'asset'

interface Pagination {
  offset: number
  limit: number
  total: number
  returned: number
  truncated: boolean
}

interface SourceRow {
  key: string
  sourcePath?: string
  packageName?: string
  rawSize: number
  compressedSize: number
  client: boolean
  server: boolean
  traced: boolean
  chunks: string[]
  chunkCount: number
  chunksTruncated: boolean
}

interface OverviewArgs {
  snapshot?: string
  environment?: 'total' | 'client'
  metric?: Metric
  routeFilter?: string
  offset?: number
  limit?: number
}

interface SourcesArgs {
  route: string
  snapshot?: string
  search?: string
  environment?: Environment
  fileTypes?: FileType[]
  groupBy?: 'source' | 'package'
  metric?: Metric
  offset?: number
  limit?: number
}

interface ExplainArgs {
  route: string
  sourcePath: string
  snapshot?: string
  moduleIdent?: string
  environment?: Environment
  maxDepth?: number
}

function jsonResult(value: unknown, isError = false) {
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  }
}

function publicError(error: unknown): string {
  if (!(error instanceof Error)) return 'Unable to query analyzer data'
  if (error.message.startsWith('Unknown snapshot')) return 'Unknown snapshot'
  if (error.message.startsWith('Unknown route')) return 'Unknown route'
  if (error.message.startsWith('Unknown source')) return 'Unknown source'
  if (/^(?:Invalid |moduleIdent )/.test(error.message)) {
    return error.message
  }
  return 'Unable to query analyzer data'
}

function safeTool<T, R>(fn: (args: T) => Promise<R>) {
  return async (args: T) => {
    try {
      return jsonResult(await fn(args))
    } catch (error) {
      return jsonResult({ error: publicError(error) }, true)
    }
  }
}

function pagination(offset: number, limit: number, total: number): Pagination {
  return {
    offset,
    limit,
    total,
    returned: Math.max(0, Math.min(limit, total - offset)),
    truncated: offset + limit < total,
  }
}

function page<T>(values: T[], offset: number, limit: number) {
  return {
    values: values.slice(offset, offset + limit),
    pagination: pagination(offset, limit, values.length),
  }
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function metricValue(
  value: { rawSize: number; compressedSize: number },
  metric: Metric
): number {
  return metric === 'compressed' ? value.compressedSize : value.rawSize
}

function outputEnvironment(filename: string): 'client' | 'server' {
  return filename.startsWith('[client-fs]/') ? 'client' : 'server'
}

function sourceSizes(
  data: AnalyzeData,
  sourceIndex: number,
  environment: Environment
): { rawSize: number; compressedSize: number } {
  let rawSize = 0
  let compressedSize = 0
  for (const partIndex of data.sourceChunkParts(sourceIndex)) {
    const part = data.chunkPart(partIndex)
    const output = part && data.outputFile(part.output_file_index)
    if (!part || !output) continue
    if (
      environment !== 'total' &&
      outputEnvironment(output.filename) !== environment
    ) {
      continue
    }
    rawSize += part.size
    compressedSize += part.compressed_size
  }
  return { rawSize, compressedSize }
}

function routeSizes(data: AnalyzeData, environment: Environment) {
  let rawSize = 0
  let compressedSize = 0
  for (let index = 0; index < data.sourceCount(); index++) {
    const sizes = sourceSizes(data, index, environment)
    rawSize += sizes.rawSize
    compressedSize += sizes.compressedSize
  }
  return { rawSize, compressedSize }
}

function packageNameFromPath(sourcePath: string): string | undefined {
  const marker = 'node_modules/'
  const start = sourcePath.lastIndexOf(marker)
  if (start === -1) return undefined
  const parts = sourcePath.slice(start + marker.length).split('/')
  if (!parts[0] || parts[0] === '.pnpm') return undefined
  return parts[0].startsWith('@') && parts[1]
    ? `${parts[0]}/${parts[1]}`
    : parts[0]
}

function hasFileType(
  flags: ReturnType<AnalyzeData['getSourceFlags']>,
  types: FileType[] | undefined
): boolean {
  return !types?.length || types.some((type) => flags[type])
}

function collectSources(
  data: AnalyzeData,
  options: {
    search?: string
    environment: Environment
    fileTypes?: FileType[]
    groupBy: 'source' | 'package'
  }
): SourceRow[] {
  const search = options.search?.toLocaleLowerCase()
  const rows = new Map<string, SourceRow>()
  for (let index = 0; index < data.sourceCount(); index++) {
    if (data.sourceChunkParts(index).length === 0) continue
    const sourcePath = data.getFullSourcePath(index)
    if (
      !sourcePath ||
      (search && !sourcePath.toLocaleLowerCase().includes(search))
    ) {
      continue
    }
    const flags = data.getSourceFlags(index)
    if (
      (options.environment === 'client' && !flags.client) ||
      (options.environment === 'server' && !flags.server) ||
      !hasFileType(flags, options.fileTypes)
    ) {
      continue
    }
    const sizes = sourceSizes(data, index, options.environment)
    if (sizes.rawSize === 0 && sizes.compressedSize === 0) continue
    const packageName = packageNameFromPath(sourcePath)
    const key =
      options.groupBy === 'package' && packageName ? packageName : sourcePath
    const existing = rows.get(key)
    if (existing) {
      existing.rawSize += sizes.rawSize
      existing.compressedSize += sizes.compressedSize
      existing.client ||= flags.client
      existing.server ||= flags.server
      existing.traced ||= flags.traced
      existing.chunks.push(...data.sourceChunks(index))
    } else {
      rows.set(key, {
        key,
        ...(options.groupBy === 'package' && packageName
          ? { packageName }
          : { sourcePath }),
        ...sizes,
        client: flags.client,
        server: flags.server,
        traced: flags.traced,
        chunks: data.sourceChunks(index),
        chunkCount: 0,
        chunksTruncated: false,
      })
    }
  }
  return [...rows.values()].map((row) => {
    const chunks = [...new Set(row.chunks)].sort(compareText)
    return {
      ...row,
      chunks: chunks.slice(0, MAX_CHUNKS),
      chunkCount: chunks.length,
      chunksTruncated: chunks.length > MAX_CHUNKS,
    }
  })
}

function sortBySize(rows: SourceRow[], metric: Metric): SourceRow[] {
  return rows.sort(
    (a, b) =>
      metricValue(b, metric) - metricValue(a, metric) ||
      compareText(a.key, b.key)
  )
}

const POTENTIAL_ENTRY_DEPENDENTS = [
  'next-app-loader',
  'next-edge-app-route-loader',
  'next-edge-ssr-loader',
  'next-route-loader',
  'app-page',
  'pages-page',
]
const CLIENT_ENTRIES = ['app-pages-internals', 'pages-dir-browser']

function activeEntries(modules: ModulesData, data: AnalyzeData): Set<number> {
  const result = new Set<number>()
  for (let index = 0; index < modules.moduleCount(); index++) {
    const module = modules.module(index)
    if (!module) continue
    if (
      POTENTIAL_ENTRY_DEPENDENTS.some((entry) => module.ident.includes(entry))
    ) {
      let matchedRouteSource = false
      for (const dependency of modules.moduleDependencies(index)) {
        const dependencyModule = modules.module(dependency)
        if (
          dependencyModule &&
          !dependencyModule.path.includes('next/dist/') &&
          data.getSourceIndexFromPath(dependencyModule.path) !== undefined
        ) {
          matchedRouteSource = true
          result.add(dependency)
        }
      }
      if (matchedRouteSource) result.add(index)
    }
    if (
      CLIENT_ENTRIES.some((entry) => module.ident.includes(entry)) &&
      data.getSourceIndexFromPath(module.path) !== undefined
    ) {
      result.add(index)
    }
  }
  return result
}

function routeModules(
  modules: ModulesData,
  entries: Set<number>
): { modules: Set<number>; truncated: boolean } {
  const reachable = new Set(entries)
  const queue = [...entries]
  while (queue.length) {
    const current = queue.shift()!
    const dependencies = [
      ...modules.moduleDependencies(current),
      ...modules.asyncModuleDependencies(current),
      ...modules.tracedModuleDependencies(current),
    ]
    for (const dependency of dependencies) {
      if (reachable.has(dependency)) continue
      if (reachable.size >= MAX_GRAPH_NODES) {
        return { modules: reachable, truncated: true }
      }
      reachable.add(dependency)
      queue.push(dependency)
    }
  }
  return { modules: reachable, truncated: false }
}

function moduleMatchesEnvironment(
  ident: string,
  environment: Environment
): boolean {
  if (environment === 'total') return true
  if (environment === 'client') {
    return !['ssr', 'rsc', 'route', 'api'].some((layer) =>
      ident.includes(layer)
    )
  }
  return !ident.includes('client')
}

function moduleIdentity(modules: ModulesData, index: number) {
  const module = modules.module(index)
  return module ? { ident: module.ident, path: module.path } : undefined
}

function findImporterChain(
  modules: ModulesData,
  start: number,
  entries: Set<number>,
  reachable: Set<number>,
  maxDepth: number,
  graphTruncated: boolean
): {
  chain: Array<{
    module: { ident: string; path: string }
    edgeKind?: 'sync' | 'async' | 'traced'
  }>
  truncated: boolean
} {
  type Node = {
    index: number
    chain: Array<{ index: number; edgeKind?: 'sync' | 'async' | 'traced' }>
  }
  const queue: Node[] = [{ index: start, chain: [{ index: start }] }]
  const visited = new Set([start])
  let truncated = graphTruncated
  while (queue.length) {
    const current = queue.shift()!
    if (entries.has(current.index)) {
      return {
        chain: current.chain.map((item, index) => ({
          module: moduleIdentity(modules, item.index)!,
          ...(index > 0 ? { edgeKind: item.edgeKind } : {}),
        })),
        truncated: false,
      }
    }
    if (current.chain.length - 1 >= maxDepth) {
      truncated = true
      continue
    }
    const edges: Array<[number, 'sync' | 'async' | 'traced']> = [
      ...modules
        .moduleDependents(current.index)
        .map((index) => [index, 'sync'] as [number, 'sync']),
      ...modules
        .asyncModuleDependents(current.index)
        .map((index) => [index, 'async'] as [number, 'async']),
      ...modules
        .tracedModuleDependents(current.index)
        .map((index) => [index, 'traced'] as [number, 'traced']),
    ]
    edges.sort((a, b) => {
      const moduleA = modules.module(a[0])
      const moduleB = modules.module(b[0])
      return (
        compareText(moduleA?.ident ?? '', moduleB?.ident ?? '') ||
        compareText(moduleA?.path ?? '', moduleB?.path ?? '') ||
        compareText(a[1], b[1]) ||
        a[0] - b[0]
      )
    })
    for (const [index, edgeKind] of edges) {
      if (
        visited.has(index) ||
        !reachable.has(index) ||
        !modules.module(index)
      ) {
        continue
      }
      if (visited.size >= MAX_GRAPH_NODES) {
        truncated = true
        continue
      }
      visited.add(index)
      queue.push({
        index,
        chain: [...current.chain, { index, edgeKind }],
      })
    }
  }
  return { chain: [], truncated }
}

function provenance(metadata: SnapshotMetadata) {
  return {
    id: metadata.id,
    createdAt: metadata.createdAt,
    baselineName: metadata.baselineName,
    nextVersion: metadata.nextVersion,
    gitBranch: metadata.gitBranch,
    gitSha: metadata.gitSha,
    gitDirty: metadata.gitDirty,
    routeCount: metadata.routeCount,
  }
}

const pagingSchema = {
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Zero-based result offset.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(
      `Maximum results to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`
    ),
}
const snapshotSchema = z
  .string()
  .max(100)
  .optional()
  .describe('`current` (default) or an exact historical snapshot ID.')
const metricSchema = z.enum(['raw', 'compressed']).optional()
const environmentSchema = z.enum(['total', 'client', 'server']).optional()

export function createAnalyzeMcpServer(repository: AnalyzeRepository) {
  const server = new McpServer({
    name: 'Next.js Turbopack Bundle Analyzer',
    version: '0.1.0',
  })

  server.registerTool(
    'get_bundle_overview',
    {
      description:
        'List analyzer snapshots and rank routes by raw or estimated compressed bundle contribution.',
      inputSchema: {
        snapshot: snapshotSchema,
        environment: z.enum(['total', 'client']).optional(),
        metric: metricSchema,
        routeFilter: z.string().max(1000).optional(),
        ...pagingSchema,
      },
    },
    safeTool(async (args: OverviewArgs) => {
      const snapshot = await repository.getSnapshot(args.snapshot)
      const snapshots = await repository.listSnapshots()
      const environment = args.environment ?? 'total'
      const metric = args.metric ?? 'raw'
      const filter = args.routeFilter?.toLocaleLowerCase()
      const rows = []
      for (const route of snapshot.routes) {
        if (filter && !route.toLocaleLowerCase().includes(filter)) continue
        const sizes = routeSizes(
          await repository.loadRoute(args.snapshot, route),
          environment
        )
        rows.push({ route, ...sizes })
      }
      rows.sort(
        (a, b) =>
          metricValue(b, metric) - metricValue(a, metric) ||
          compareText(a.route, b.route)
      )
      const paged = page(rows, args.offset ?? 0, args.limit ?? DEFAULT_LIMIT)
      return {
        snapshot: provenance(snapshot.metadata),
        snapshots: {
          current: provenance(snapshots.current),
          history: snapshots.history.map(provenance),
        },
        environment,
        metric,
        resultCounts: {
          routesInSnapshot: snapshot.routes.length,
          matched: rows.length,
        },
        routes: paged.values,
        pagination: paged.pagination,
        caveats: [COMPRESSED_CAVEAT],
      }
    })
  )

  server.registerTool(
    'query_bundle_sources',
    {
      description:
        'Query and rank source or npm-package contributions for one analyzed route.',
      inputSchema: {
        route: z.string().max(4096),
        snapshot: snapshotSchema,
        search: z.string().max(1000).optional(),
        environment: environmentSchema,
        fileTypes: z
          .array(z.enum(['js', 'css', 'json', 'asset']))
          .max(4)
          .optional(),
        groupBy: z.enum(['source', 'package']).optional(),
        metric: metricSchema,
        ...pagingSchema,
      },
    },
    safeTool(async (args: SourcesArgs) => {
      const environment = args.environment ?? 'total'
      const metric = args.metric ?? 'raw'
      const rows = sortBySize(
        collectSources(await repository.loadRoute(args.snapshot, args.route), {
          search: args.search,
          environment,
          fileTypes: args.fileTypes,
          groupBy: args.groupBy ?? 'source',
        }),
        metric
      )
      const paged = page(rows, args.offset ?? 0, args.limit ?? DEFAULT_LIMIT)
      return {
        route: args.route,
        snapshot: provenance(
          (await repository.getSnapshot(args.snapshot)).metadata
        ),
        environment,
        metric,
        groupBy: args.groupBy ?? 'source',
        sources: paged.values,
        pagination: paged.pagination,
        caveats: [COMPRESSED_CAVEAT],
      }
    })
  )

  server.registerTool(
    'explain_bundle_source',
    {
      description:
        'Explain one source contribution and return a bounded importer chain toward a heuristic route entry.',
      inputSchema: {
        route: z.string().max(4096),
        sourcePath: z.string().max(4096),
        snapshot: snapshotSchema,
        moduleIdent: z.string().max(4096).optional(),
        environment: environmentSchema,
        maxDepth: z.number().int().min(1).max(100).optional(),
      },
    },
    safeTool(async (args: ExplainArgs) => {
      const environment = args.environment ?? 'total'
      const data = await repository.loadRoute(args.snapshot, args.route)
      const sourceIndex = data.getSourceIndexFromPath(args.sourcePath)
      if (sourceIndex === undefined)
        throw new Error(`Unknown source: ${args.sourcePath}`)
      const modules = await repository.loadModules(args.snapshot)
      const candidates = modules
        .getModuleIndiciesFromPath(args.sourcePath)
        .filter((index) => {
          const module = modules.module(index)
          return module && moduleMatchesEnvironment(module.ident, environment)
        })
        .map((index) => ({ index, module: moduleIdentity(modules, index)! }))
        .sort(
          (a, b) =>
            compareText(a.module.ident, b.module.ident) ||
            compareText(a.module.path, b.module.path)
        )
      const publicCandidates = candidates
        .slice(0, MAX_MODULE_CANDIDATES)
        .map(({ module }) => module)
      const selected = args.moduleIdent
        ? candidates.find(({ module }) => module.ident === args.moduleIdent)
        : candidates.length === 1
          ? candidates[0]
          : undefined
      if (args.moduleIdent && !selected) {
        throw new Error(
          'moduleIdent does not match a module candidate for this source'
        )
      }
      const sizes = sourceSizes(data, sourceIndex, environment)
      const flags = data.getSourceFlags(sourceIndex)
      const chunks = data.sourceChunks(sourceIndex)
      const entries = activeEntries(modules, data)
      const routeGraph = routeModules(modules, entries)
      const response = {
        route: args.route,
        snapshot: provenance(
          (await repository.getSnapshot(args.snapshot)).metadata
        ),
        sourcePath: args.sourcePath,
        ...sizes,
        flags: {
          client: flags.client,
          server: flags.server,
          traced: flags.traced,
        },
        chunks: chunks.slice(0, MAX_CHUNKS),
        chunkCount: chunks.length,
        chunksTruncated: chunks.length > MAX_CHUNKS,
        moduleCandidates: publicCandidates,
        moduleCandidateCount: candidates.length,
        moduleCandidatesTruncated: candidates.length > MAX_MODULE_CANDIDATES,
        ambiguous: candidates.length > 1 && !args.moduleIdent,
        selectedModule: selected?.module,
        importerChain: selected
          ? findImporterChain(
              modules,
              selected.index,
              entries,
              routeGraph.modules,
              args.maxDepth ?? 25,
              routeGraph.truncated
            )
          : undefined,
        routeEntryDetection: { heuristic: true },
        caveats: [COMPRESSED_CAVEAT, ENTRY_HEURISTIC_CAVEAT],
      }
      return response
    })
  )

  return server
}
