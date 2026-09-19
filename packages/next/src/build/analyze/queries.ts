import type { AnalyzeData, ModulesData } from '../../shared/lib/analyze-data'
import type { SnapshotMetadata } from './snapshot'
import type { AnalyzeRepository } from './repository'
import z from 'next/dist/compiled/zod'

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

interface DiffRow {
  key: string
  baselineRawSize: number
  comparisonRawSize: number
  baselineCompressedSize: number
  comparisonCompressedSize: number
  status: 'added' | 'removed' | 'changed' | 'identical'
  delta: number
}

interface DiffInput extends Omit<DiffRow, 'status' | 'delta'> {
  baselinePresent: boolean
  comparisonPresent: boolean
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

interface CompareArgs {
  baselineSnapshot: string
  comparisonSnapshot?: string
  granularity?: 'route' | 'source' | 'package'
  route?: string
  environment?: Environment
  metric?: Metric
  search?: string
  offset?: number
  limit?: number
}

class DetailedToolError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown>
  ) {
    super(message)
  }
}

function publicError(error: unknown): Record<string, unknown> {
  if (error instanceof DetailedToolError) {
    return { error: error.message, ...error.details }
  }
  if (!(error instanceof Error))
    return { error: 'Unable to query analyzer data' }
  if (error.message.startsWith('Unknown snapshot')) {
    return { error: 'Unknown snapshot' }
  }
  if (error.message.startsWith('Unknown route'))
    return { error: 'Unknown route' }
  if (error.message.startsWith('Unknown source')) {
    return { error: 'Unknown source' }
  }
  if (
    /^(?:Invalid |moduleIdent |route is required|Route comparisons)/.test(
      error.message
    )
  ) {
    return { error: error.message }
  }
  return { error: 'Unable to query analyzer data' }
}

export class AnalyzeQueryError extends Error {
  constructor(readonly output: Record<string, unknown>) {
    super(
      typeof output.error === 'string' ? output.error : 'Analyzer query failed'
    )
  }
}

function safeTool<T, R>(fn: (args: T) => Promise<R>) {
  return async (args: T) => {
    try {
      return await fn(args)
    } catch (error) {
      if (error instanceof AnalyzeQueryError) throw error
      throw new AnalyzeQueryError(publicError(error))
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

function diffStatus(
  inBaseline: boolean,
  inComparison: boolean,
  baselineRawSize: number,
  comparisonRawSize: number
): DiffRow['status'] {
  if (!inBaseline) return 'added'
  if (!inComparison) return 'removed'
  return baselineRawSize === comparisonRawSize ? 'identical' : 'changed'
}

function summarizeDiff(
  rows: DiffInput[],
  metric: Metric,
  offset: number,
  limit: number
) {
  const completed: DiffRow[] = rows.map(
    ({ baselinePresent, comparisonPresent, ...row }) => {
      const status = diffStatus(
        baselinePresent,
        comparisonPresent,
        row.baselineRawSize,
        row.comparisonRawSize
      )
      const delta =
        metric === 'compressed'
          ? row.comparisonCompressedSize - row.baselineCompressedSize
          : row.comparisonRawSize - row.baselineRawSize
      return { ...row, status, delta }
    }
  )
  completed.sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta) || compareText(a.key, b.key)
  )
  const counts = { added: 0, removed: 0, changed: 0, identical: 0 }
  let baselineRawSize = 0
  let comparisonRawSize = 0
  let baselineCompressedSize = 0
  let comparisonCompressedSize = 0
  for (const row of completed) {
    counts[row.status]++
    baselineRawSize += row.baselineRawSize
    comparisonRawSize += row.comparisonRawSize
    baselineCompressedSize += row.baselineCompressedSize
    comparisonCompressedSize += row.comparisonCompressedSize
  }
  const paged = page(completed, offset, limit)
  return {
    counts,
    totals: {
      baselineRawSize,
      comparisonRawSize,
      baselineCompressedSize,
      comparisonCompressedSize,
      delta:
        metric === 'compressed'
          ? comparisonCompressedSize - baselineCompressedSize
          : comparisonRawSize - baselineRawSize,
    },
    rows: paged.values,
    pagination: paged.pagination,
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
const metricSchema = z
  .enum(['raw', 'compressed'])
  .optional()
  .describe('Size metric. Default: `raw`.')
const environmentSchema = z
  .enum(['total', 'client', 'server'])
  .optional()
  .describe('Attribution environment. Default: `total`.')

function jsonField(input: z.ZodTypeAny): {
  schema: Record<string, unknown>
  required: boolean
} {
  const description = input.description
  let field = input
  let required = true
  if (field instanceof z.ZodOptional) {
    required = false
    field = field.unwrap()
  }

  const schema: Record<string, unknown> = {}
  if (field instanceof z.ZodString) {
    schema.type = 'string'
    for (const check of field._def.checks) {
      if (check.kind === 'min') schema.minLength = check.value
      if (check.kind === 'max') schema.maxLength = check.value
    }
  } else if (field instanceof z.ZodNumber) {
    schema.type = field._def.checks.some((check) => check.kind === 'int')
      ? 'integer'
      : 'number'
    for (const check of field._def.checks) {
      if (check.kind === 'min') schema.minimum = check.value
      if (check.kind === 'max') schema.maximum = check.value
    }
  } else if (field instanceof z.ZodEnum) {
    schema.type = 'string'
    schema.enum = field.options
  } else if (field instanceof z.ZodArray) {
    schema.type = 'array'
    schema.items = jsonField(field.element).schema
    if (field._def.maxLength) schema.maxItems = field._def.maxLength.value
  } else {
    throw new Error(`Unsupported analyzer query schema: ${field._def.typeName}`)
  }
  if (description) schema.description = description
  return { schema, required }
}

function jsonSchema(shape: z.ZodRawShape): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [name, field] of Object.entries(shape)) {
    const result = jsonField(field)
    properties[name] = result.schema
    if (result.required) required.push(name)
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  }
}

export type AnalyzeQueryListing = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  example: Record<string, unknown>
}

type StoredQuery = AnalyzeQueryListing & {
  execute: (input: unknown) => Promise<unknown>
}

export class AnalyzeQueryRegistry {
  constructor(private readonly queries: StoredQuery[]) {}

  list(): AnalyzeQueryListing[] {
    return this.queries.map(({ execute: _execute, ...query }) => query)
  }

  async execute(name: string, input: unknown): Promise<unknown> {
    const query = this.queries.find((item) => item.name === name)
    if (!query) {
      throw new AnalyzeQueryError({ error: `Unknown analyzer query: ${name}` })
    }
    try {
      return await query.execute(input)
    } catch (error) {
      if (error instanceof AnalyzeQueryError) throw error
      if (error instanceof z.ZodError) {
        throw new AnalyzeQueryError({
          error: `Invalid arguments for query ${name}: ${error.message}`,
          example: query.example,
        })
      }
      throw error
    }
  }
}

export function createAnalyzeQueryRegistry(repository: AnalyzeRepository) {
  const queries: StoredQuery[] = []
  function registerQuery<T extends z.ZodRawShape>(
    name: string,
    config: {
      description: string
      inputSchema: T
      example: Record<string, unknown>
    },
    callback: (args: z.infer<z.ZodObject<T>>) => Promise<unknown>
  ) {
    const schema = z.object(config.inputSchema).strict()
    queries.push({
      name,
      description: config.description,
      inputSchema: jsonSchema(config.inputSchema),
      example: config.example,
      execute: (input) => callback(schema.parse(input)),
    })
  }

  registerQuery(
    'get_bundle_overview',
    {
      description:
        'List analyzer snapshots and rank routes by raw or estimated compressed bundle contribution.',
      inputSchema: {
        snapshot: snapshotSchema,
        environment: z
          .enum(['total', 'client'])
          .optional()
          .describe('Attribution environment. Default: `total`.'),
        metric: metricSchema,
        routeFilter: z.string().max(1000).optional(),
        ...pagingSchema,
      },
      example: { environment: 'client', limit: 10 },
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

  registerQuery(
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
        groupBy: z
          .enum(['source', 'package'])
          .optional()
          .describe('Result grouping. Default: `source`.'),
        metric: metricSchema,
        ...pagingSchema,
      },
      example: {
        route: '/',
        environment: 'client',
        groupBy: 'package',
        limit: 20,
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

  registerQuery(
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
        maxDepth: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum importer-chain depth. Default: 25.'),
      },
      example: { route: '/', sourcePath: '[project]/src/app/page.tsx' },
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

  registerQuery(
    'compare_bundles',
    {
      description:
        'Compare two analyzer snapshots at route, source, or npm-package granularity.',
      inputSchema: {
        baselineSnapshot: z
          .string()
          .max(100)
          .describe(
            'Required historical snapshot ID from get_bundle_overview. Example: `20260917-201045-7afb1d3`.'
          ),
        comparisonSnapshot: snapshotSchema,
        granularity: z
          .enum(['route', 'source', 'package'])
          .optional()
          .describe('Comparison granularity. Default: `route`.'),
        route: z.string().max(4096).optional(),
        environment: environmentSchema,
        metric: metricSchema,
        search: z.string().max(1000).optional(),
        ...pagingSchema,
      },
      example: {
        baselineSnapshot: '20260917-201045-abcdef0',
        comparisonSnapshot: 'current',
        limit: 20,
      },
    },
    safeTool(async (args: CompareArgs) => {
      const granularity = args.granularity ?? 'route'
      const environment = args.environment ?? 'total'
      const metric = args.metric ?? 'raw'
      const offset = args.offset ?? 0
      const limit = args.limit ?? DEFAULT_LIMIT
      if (granularity === 'route' && args.route) {
        throw new Error(
          'Invalid route: route is only supported for source/package comparisons'
        )
      }

      const listed = await repository.listSnapshots()
      const seen = new Set<string>()
      const availableSnapshots = [listed.current, ...listed.history]
        .filter((snapshot) => {
          if (seen.has(snapshot.id)) return false
          seen.add(snapshot.id)
          return true
        })
        .map(({ id, createdAt }) => ({ id, createdAt }))
      const validIds = new Set(availableSnapshots.map(({ id }) => id))
      const assertSnapshot = (value: string | undefined, field: string) => {
        if (
          value !== undefined &&
          value !== 'current' &&
          !validIds.has(value)
        ) {
          throw new DetailedToolError(`Invalid ${field}: unknown snapshot`, {
            availableSnapshots,
          })
        }
      }
      assertSnapshot(args.baselineSnapshot, 'baselineSnapshot')
      assertSnapshot(args.comparisonSnapshot, 'comparisonSnapshot')

      const baseline = await repository.getSnapshot(args.baselineSnapshot)
      const comparison = await repository.getSnapshot(args.comparisonSnapshot)
      if (baseline.metadata.id === comparison.metadata.id) {
        throw new DetailedToolError(
          availableSnapshots.length === 1
            ? 'No distinct baseline snapshot is available'
            : 'Baseline and comparison must be different snapshots',
          { availableSnapshots }
        )
      }

      const search = args.search?.toLocaleLowerCase()
      let rows: DiffInput[]
      if (granularity === 'route') {
        if (environment === 'server') {
          throw new Error(
            'Route comparisons support total or client environments'
          )
        }
        const keys = [...new Set([...baseline.routes, ...comparison.routes])]
          .filter(
            (route) => !search || route.toLocaleLowerCase().includes(search)
          )
          .sort()
        rows = []
        for (const route of keys) {
          const baselineSizes = baseline.routes.includes(route)
            ? routeSizes(
                await repository.loadRoute(args.baselineSnapshot, route),
                environment
              )
            : { rawSize: 0, compressedSize: 0 }
          const comparisonSizes = comparison.routes.includes(route)
            ? routeSizes(
                await repository.loadRoute(args.comparisonSnapshot, route),
                environment
              )
            : { rawSize: 0, compressedSize: 0 }
          rows.push({
            key: route,
            baselinePresent: baseline.routes.includes(route),
            comparisonPresent: comparison.routes.includes(route),
            baselineRawSize: baselineSizes.rawSize,
            comparisonRawSize: comparisonSizes.rawSize,
            baselineCompressedSize: baselineSizes.compressedSize,
            comparisonCompressedSize: comparisonSizes.compressedSize,
          })
        }
      } else {
        if (!args.route)
          throw new Error('route is required for source/package comparisons')
        const groupBy = granularity === 'package' ? 'package' : 'source'
        const inBaseline = baseline.routes.includes(args.route)
        const inComparison = comparison.routes.includes(args.route)
        if (!inBaseline && !inComparison) {
          throw new Error(`Unknown route: ${args.route}`)
        }
        const baselineRows = new Map(
          (inBaseline
            ? collectSources(
                await repository.loadRoute(args.baselineSnapshot, args.route),
                { search: args.search, environment, groupBy }
              )
            : []
          ).map((row) => [row.key, row])
        )
        const comparisonRows = new Map(
          (inComparison
            ? collectSources(
                await repository.loadRoute(args.comparisonSnapshot, args.route),
                { search: args.search, environment, groupBy }
              )
            : []
          ).map((row) => [row.key, row])
        )
        rows = [...new Set([...baselineRows.keys(), ...comparisonRows.keys()])]
          .sort()
          .map((key) => {
            const a = baselineRows.get(key)
            const b = comparisonRows.get(key)
            return {
              key,
              baselinePresent: a !== undefined,
              comparisonPresent: b !== undefined,
              baselineRawSize: a?.rawSize ?? 0,
              comparisonRawSize: b?.rawSize ?? 0,
              baselineCompressedSize: a?.compressedSize ?? 0,
              comparisonCompressedSize: b?.compressedSize ?? 0,
            }
          })
      }
      return {
        granularity,
        route: args.route,
        environment,
        metric,
        baseline: provenance(baseline.metadata),
        comparison: provenance(comparison.metadata),
        effectiveInputs: {
          baselineSnapshot: baseline.metadata.id,
          comparisonSnapshot: comparison.metadata.id,
          granularity,
          ...(args.route ? { route: args.route } : {}),
          environment,
          metric,
          ...(args.search ? { search: args.search } : {}),
          offset,
          limit,
        },
        ...summarizeDiff(rows, metric, offset, limit),
        caveats: [COMPRESSED_CAVEAT],
      }
    })
  )

  return new AnalyzeQueryRegistry(queries)
}
