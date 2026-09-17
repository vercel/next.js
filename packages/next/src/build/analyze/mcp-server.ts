import type { AnalyzeData } from '../../shared/lib/analyze-data'
import type { SnapshotMetadata } from './snapshot'
import type { AnalyzeRepository } from './repository'
import z from 'next/dist/compiled/zod'

const { McpServer } =
  require('next/dist/compiled/@modelcontextprotocol/sdk/server/mcp') as typeof import('next/dist/compiled/@modelcontextprotocol/sdk/server/mcp')

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const COMPRESSED_CAVEAT =
  'Compressed source sizes are estimates because attributed parts are compressed independently.'

type Environment = 'total' | 'client'
type Metric = 'raw' | 'compressed'

interface OverviewArgs {
  snapshot?: string
  environment?: 'total' | 'client'
  metric?: Metric
  routeFilter?: string
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
      (output.filename.startsWith('[client-fs]/') ? 'client' : 'server') !==
        environment
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

  return server
}
