import type { AnalyzeData } from '../../shared/lib/analyze-data'
import type { SnapshotMetadata } from './snapshot'
import type { AnalyzeRepository } from './repository'
import z from 'next/dist/compiled/zod'

const { McpServer } =
  require('next/dist/compiled/@modelcontextprotocol/sdk/server/mcp') as typeof import('next/dist/compiled/@modelcontextprotocol/sdk/server/mcp')

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const MAX_CHUNKS = 100
const COMPRESSED_CAVEAT =
  'Compressed source sizes are estimates because attributed parts are compressed independently.'

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
  if (/^Invalid /.test(error.message)) {
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

  return server
}
