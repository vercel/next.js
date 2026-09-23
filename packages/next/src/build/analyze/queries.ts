import type { AnalyzeData } from '../../shared/lib/analyze-data'
import type { SnapshotMetadata } from './snapshot'
import type { AnalyzeRepository } from './repository'
import z from 'next/dist/compiled/zod'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const COMPRESSED_CAVEAT =
  'Compressed source sizes are estimates because attributed parts are compressed independently.'

type Environment = 'total' | 'client' | 'server'
type Metric = 'raw' | 'compressed'
type FileType = 'js' | 'css' | 'json' | 'asset'
type OutputKind =
  | 'js'
  | 'css'
  | 'json'
  | 'font'
  | 'image'
  | 'media'
  | 'wasm'
  | 'other'

interface SourceRow {
  key: string
  sourcePath?: string
  packageName?: string
  rawSize: number
  compressedSize: number
  client: boolean
  server: boolean
  traced: boolean
  chunkNames: string[]
  chunkCount: number
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

interface SourceChunksArgs {
  route: string
  sourcePath: string
  snapshot?: string
  offset?: number
  limit?: number
}

export class AnalyzeQueryError extends Error {
  constructor(readonly output: Record<string, unknown>) {
    super(
      typeof output.error === 'string' ? output.error : 'Analyzer query failed'
    )
  }
}

function publicError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error))
    return { error: 'Unable to query analyzer data' }
  if (error.message.startsWith('Unknown snapshot')) {
    return { error: 'Unknown snapshot' }
  }
  if (error.message.startsWith('Unknown route'))
    return { error: 'Unknown route' }
  if (/^Invalid /.test(error.message)) return { error: error.message }
  return { error: 'Unable to query analyzer data' }
}

function safeQuery<T, R>(fn: (args: T) => Promise<R>) {
  return async (args: T) => {
    try {
      return await fn(args)
    } catch (error) {
      throw new AnalyzeQueryError(publicError(error))
    }
  }
}

type StoredQuery = {
  name: string
  execute: (input: unknown) => Promise<unknown>
}

export class AnalyzeQueryRegistry {
  constructor(private readonly queries: StoredQuery[]) {}

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
        })
      }
      throw error
    }
  }
}

function page<T>(values: T[], offset: number, limit: number) {
  const result = values.slice(offset, offset + limit)
  return {
    values: result,
    pagination: {
      offset,
      limit,
      total: values.length,
      returned: result.length,
      truncated: offset + limit < values.length,
    },
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

function outputKind(filename: string): OutputKind {
  const pathname = filename.split(/[?#]/, 1)[0].toLocaleLowerCase()
  if (/\.(?:js|mjs|cjs)$/.test(pathname)) return 'js'
  if (pathname.endsWith('.css')) return 'css'
  if (pathname.endsWith('.json')) return 'json'
  if (/\.(?:woff2?|ttf|otf|eot)$/.test(pathname)) return 'font'
  if (/\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/.test(pathname)) return 'image'
  if (/\.(?:mp4|webm|ogg|mp3|wav|flac|aac|mov)$/.test(pathname)) return 'media'
  if (pathname.endsWith('.wasm')) return 'wasm'
  return 'other'
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
      existing.chunkNames.push(...data.sourceChunks(index))
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
        chunkNames: data.sourceChunks(index),
        chunkCount: 0,
      })
    }
  }
  return [...rows.values()].map((row) => {
    const chunkCount = new Set(row.chunkNames).size
    return { ...row, chunkCount }
  })
}

function sortBySize(rows: SourceRow[], metric: Metric): SourceRow[] {
  return rows.sort(
    (a, b) =>
      metricValue(b, metric) - metricValue(a, metric) ||
      compareText(a.key, b.key)
  )
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
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
}
const snapshotSchema = z.string().max(100).optional()
const metricSchema = z.enum(['raw', 'compressed']).optional()
const environmentSchema = z.enum(['total', 'client', 'server']).optional()

export function createAnalyzeQueryRegistry(repository: AnalyzeRepository) {
  const queries: StoredQuery[] = []
  function registerQuery<T extends z.ZodRawShape>(
    name: string,
    inputSchema: T,
    callback: (args: z.infer<z.ZodObject<T>>) => Promise<unknown>
  ) {
    const schema = z.object(inputSchema).strict()
    queries.push({ name, execute: (input) => callback(schema.parse(input)) })
  }

  registerQuery(
    'get_app_overview',
    {
      snapshot: snapshotSchema,
      environment: z.enum(['total', 'client']).optional(),
      metric: metricSchema,
      routeFilter: z.string().max(1000).optional(),
      ...pagingSchema,
    },
    safeQuery(async (args: OverviewArgs) => {
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
    'get_route_modules',
    {
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
    safeQuery(async (args: SourcesArgs) => {
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
        sources: paged.values.map(({ chunkNames: _chunkNames, ...row }) => row),
        pagination: paged.pagination,
        caveats: [COMPRESSED_CAVEAT],
      }
    })
  )

  registerQuery(
    'get_source_chunks',
    {
      route: z.string().max(4096),
      sourcePath: z.string().max(4096),
      snapshot: snapshotSchema,
      ...pagingSchema,
    },
    safeQuery(async (args: SourceChunksArgs) => {
      const data = await repository.loadRoute(args.snapshot, args.route)
      const sourceIndex = data.getSourceIndexFromPath(args.sourcePath)
      if (sourceIndex === undefined) {
        throw new Error(`Unknown source: ${args.sourcePath}`)
      }
      const byOutput = new Map<
        number,
        { rawSize: number; compressedSize: number }
      >()
      for (const partIndex of data.sourceChunkParts(sourceIndex)) {
        const part = data.chunkPart(partIndex)
        if (!part) continue
        const sizes = byOutput.get(part.output_file_index) ?? {
          rawSize: 0,
          compressedSize: 0,
        }
        sizes.rawSize += part.size
        sizes.compressedSize += part.compressed_size
        byOutput.set(part.output_file_index, sizes)
      }
      const rows = [...byOutput]
        .map(([index, sizes]) => {
          const output = data.outputFile(index)!
          return {
            key: output.filename,
            filename: output.filename,
            kind: outputKind(output.filename),
            environment: outputEnvironment(output.filename),
            ...sizes,
            emissionEvidence: 'emitted' as const,
            requestEvidence: 'unknown' as const,
          }
        })
        .sort((a, b) => compareText(a.filename, b.filename))
      const paged = page(rows, args.offset ?? 0, args.limit ?? DEFAULT_LIMIT)
      return {
        route: args.route,
        sourcePath: args.sourcePath,
        snapshot: provenance(
          (await repository.getSnapshot(args.snapshot)).metadata
        ),
        chunks: paged.values,
        totals: rows.reduce(
          (total, row) => ({
            rawSize: total.rawSize + row.rawSize,
            compressedSize: total.compressedSize + row.compressedSize,
            outputCount: total.outputCount + 1,
          }),
          { rawSize: 0, compressedSize: 0, outputCount: 0 }
        ),
        pagination: paged.pagination,
        caveats: [COMPRESSED_CAVEAT],
      }
    })
  )

  return new AnalyzeQueryRegistry(queries)
}
