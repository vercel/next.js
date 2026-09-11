import http from 'node:http'
import z from 'next/dist/compiled/zod'
import { loadBindings } from '../../build/swc'
import type { TraceSpanInfo } from '../../build/swc/generated-native'

const { McpServer } =
  require('next/dist/compiled/@modelcontextprotocol/sdk/server/mcp') as typeof import('next/dist/compiled/@modelcontextprotocol/sdk/server/mcp')
const { StreamableHTTPServerTransport } =
  require('next/dist/compiled/@modelcontextprotocol/sdk/server/streamableHttp') as typeof import('next/dist/compiled/@modelcontextprotocol/sdk/server/streamableHttp')

const DEFAULT_WS_PORT = 5747

/** 100 internal ticks = 1 µs */
const TICKS_PER_US = 100
const TICKS_PER_MS = TICKS_PER_US * 1000
const TICKS_PER_S = TICKS_PER_MS * 1000

function formatDuration(ticks: number): string {
  if (ticks < TICKS_PER_MS) {
    const us = ticks / TICKS_PER_US
    return `${us.toFixed(0)}µs`
  }
  if (ticks < TICKS_PER_S) {
    const ms = ticks / TICKS_PER_MS
    return `${ms.toFixed(2)}ms`
  }
  const s = ticks / TICKS_PER_S
  return `${s.toFixed(3)}s`
}

function formatRelative(ticks: number): string {
  // ticks may be negative if the child starts before the parent reference point
  const prefix = ticks < 0 ? '-' : ''
  return prefix + formatDuration(Math.abs(ticks))
}

function formatBytes(bytes: number): string {
  const KB = 1024
  const MB = KB * 1024
  const GB = MB * 1024
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`
  if (bytes >= KB) return `${(bytes / KB).toFixed(2)} KB`
  return `${bytes} B`
}

function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

/**
 * Does any span in this result carry allocation data?
 *
 * Only the turbopack trace format records allocations, so this is a property of
 * the whole trace. Checking per result rather than per span keeps a real zero
 * distinguishable from a trace that never tracked allocations at all.
 */
function hasAllocationData(spans: TraceSpanInfo[]): boolean {
  return spans.some(
    (span) =>
      span.allocations > 0 ||
      span.deallocations > 0 ||
      span.allocationCount > 0 ||
      hasAllocationData(span.children)
  )
}

/**
 * Render the allocation metrics for a span.
 *
 * `total*` values cover the span and all its children; `self*` values exclude
 * children. For aggregated groups both are group totals across every span in
 * the group.
 */
function renderAllocationsMarkdown(span: TraceSpanInfo): string {
  let md = `\n**Allocations:**\n`
  md += `- **Allocated:** ${formatBytes(span.allocations)} (self ${formatBytes(span.selfAllocations)})\n`
  md += `- **Deallocated:** ${formatBytes(span.deallocations)} (self ${formatBytes(span.selfDeallocations)})\n`
  md += `- **Persistent (ranking signal, not retained):** ${formatBytes(span.persistentAllocations)} (self ${formatBytes(span.selfPersistentAllocations)})\n`
  md += `- **Allocation Count:** ${formatCount(span.allocationCount)} (self ${formatCount(span.selfAllocationCount)})\n`
  return md
}

function summarizeMemorySamples(span: TraceSpanInfo): string | null {
  const summary = span.memorySummary
  if (!summary) return null
  const delta = summary.end - summary.start
  const deltaSign = delta >= 0 ? '+' : '-'
  return (
    `samples=${summary.count}, peak=${formatBytes(summary.peak)}, min=${formatBytes(summary.min)}, ` +
    `start=${formatBytes(summary.start)}, end=${formatBytes(summary.end)}, ` +
    `Δ=${deltaSign}${formatBytes(Math.abs(delta))}, maxPressure=${summary.maxPressure}`
  )
}

/**
 * Render a single span (or aggregated span group) as a markdown section.
 *
 * `level` deepens the heading so a `depth > 1` result reads as a tree.
 */
function renderSpanMarkdown(
  span: TraceSpanInfo,
  showAllocations: boolean,
  level = 0
): string {
  const heading = '#'.repeat(Math.min(3 + level, 6))
  let md = `${heading} \`${span.name}\` (ID: \`${span.id}\`)\n`

  if (span.isAggregated && span.count !== undefined && span.count > 1) {
    md += `- **Count:** ${span.count} spans\n`
    if (span.totalCpuDuration !== undefined) {
      md += `- **Total CPU Duration:** ${formatDuration(span.totalCpuDuration)}\n`
    }
    if (span.avgCpuDuration !== undefined) {
      md += `- **Avg CPU Duration:** ${formatDuration(span.avgCpuDuration)}\n`
    }
    if (span.totalCorrectedDuration !== undefined) {
      md += `- **Total Corrected Duration:** ${formatDuration(span.totalCorrectedDuration)}\n`
    }
    if (span.avgCorrectedDuration !== undefined) {
      md += `- **Avg Corrected Duration:** ${formatDuration(span.avgCorrectedDuration)}\n`
    }
    md += `- **Start (relative to parent):** ${formatRelative(span.startRelativeToParent)}\n`
    md += `- **End (relative to parent):** ${formatRelative(span.endRelativeToParent)}\n`
    if (span.heaviestSpanId !== undefined) {
      md += `- **Heaviest member (most persistent bytes):** ID \`${span.heaviestSpanId}\`\n`
    }
    const exampleId = span.firstSpanId ?? span.id
    md += `\n#### First span as example (ID: \`${exampleId}\`)\n`
    md += `- **CPU Duration:** ${formatDuration(span.cpuDuration)}\n`
    md += `- **Corrected Duration:** ${formatDuration(span.correctedDuration)}\n`
  } else {
    md += `- **CPU Duration:** ${formatDuration(span.cpuDuration)}\n`
    md += `- **Corrected Duration:** ${formatDuration(span.correctedDuration)}\n`
    md += `- **Start (relative to parent):** ${formatRelative(span.startRelativeToParent)}\n`
    md += `- **End (relative to parent):** ${formatRelative(span.endRelativeToParent)}\n`
  }

  if (span.args && span.args.length > 0) {
    md += `\n**Attributes:**\n`
    for (const [k, v] of span.args) {
      md += `- \`${k}\`: ${v}\n`
    }
  }

  if (showAllocations) {
    md += renderAllocationsMarkdown(span)
  }

  const memSummary = summarizeMemorySamples(span)
  if (memSummary) {
    md += `\n**Memory (TurboMalloc live bytes):** ${memSummary}\n`
  }

  if (span.children.length > 0) {
    md += '\n'
    for (const child of span.children) {
      md += renderSpanMarkdown(child, showAllocations, level + 1)
    }
  } else {
    md += '\n---\n\n'
  }

  return md
}

export async function startTurboTraceServerCli(
  file: string,
  port: number | undefined,
  mcpPort: number | undefined
) {
  const wsPort = port ?? DEFAULT_WS_PORT
  const httpPort = mcpPort ?? wsPort + 1

  let bindings
  try {
    bindings = await loadBindings()
  } catch {
    console.error(
      'Error: Could not load native bindings. The trace server requires native (non-WASM) bindings.'
    )
    process.exit(1)
  }

  let handle
  try {
    // Start the WebSocket trace server on a background thread (non-blocking).
    handle = bindings.turbo.startTurbopackTraceServerHandle(file, wsPort)
  } catch (err) {
    console.error(
      `Error: Could not start trace server for "${file}": ${err instanceof Error ? err.message : err}`
    )
    process.exit(1)
  }

  console.log(
    `Turbopack trace server started. View trace at https://trace.nextjs.org?port=${wsPort}`
  )

  // Create the MCP server.
  const mcpServer = new McpServer({
    name: 'Next.js Trace Server MCP',
    version: '0.1.0',
  })

  mcpServer.registerTool(
    'query_spans',
    {
      description: [
        'Query spans from a turbopack trace file: timing, CPU, attributes, allocation counters, and TurboMalloc live-memory samples.',
        '',
        'Navigation: pass a result `id` as `parent` to drill in. `search` is recursive over the whole subtree and returns full path IDs, so you can find a span without knowing where it lives. `depth` > 1 returns that many levels nested inline; `pageSize` (default 20, max 500) widens a page.',
        '',
        'Every response is paged: `totalCount` is how many matched in all, `totalPages` how many pages that is. Getting exactly `pageSize` results does not mean there are no more — check `totalCount`. Search cost scales with subtree size, so prefer scoping `parent` (or lowering `maxDepth`) over repeated root searches on a large trace.',
        '',
        'Allocations: `allocations` / `deallocations` / `allocationCount` and `persistentAllocations`, each with a `self*` counterpart excluding children. Comparing a total to its `self` shows whether a span allocates directly or only through descendants.',
        '',
        '`persistentAllocations` ranks allocators; it is NOT retained memory. It is allocated-minus-freed per TurboMalloc counters, which never see turbo-tasks cell or cache drops, so a total far above real peak RSS is expected rather than a leak. For absolute memory use `memorySummary` (count/start/end/min/peak/maxPressure, precomputed from `memorySamples`).',
        '',
        "But live heap is process-wide: a span's samples are just the global series sliced to its time range, so concurrent spans report identical memory however much each allocated. Rank concurrent work by the allocation fields, never by memory.",
        '',
        "Frees are charged to whichever span was on the stack at free time, not the one that allocated. A child with large `selfAllocations` under a parent with large `selfDeallocations` means the parent drops the child's arena — bounded, not leaking. Large `selfPersistentAllocations` with no such counterpart above it is the shape worth suspecting.",
        '',
        'For aggregated groups every allocation field is a group total, while `cpuDuration`, `correctedDuration` and `memorySamples` describe the example span only. `firstSpanId` is first in execution order; use `heaviestSpanId` to reach the member holding the most bytes.',
        '',
        'Set `outputType: "json"` for full precision and the raw `memorySamples` triples `[tsOffsetTicks, bytes, pressure]`; markdown is a human summary.',
      ].join('\n'),
      inputSchema: {
        parent: z
          .string()
          .optional()
          .describe(
            'Span ID to enumerate children of. Omit for root-level spans. Use the `id` field from a previous result.'
          ),
        aggregated: z
          .boolean()
          .optional()
          .describe(
            'When true (default), aggregate spans with the same name into a single entry. Set to false to see individual raw spans.'
          ),
        sort: z
          .enum(['value', 'name', 'allocations', 'persistent-allocations'])
          .optional()
          .describe(
            'Sort mode: "value" for corrected duration descending, "name" for alphabetical, "allocations" for total allocated bytes descending, "persistent-allocations" for `persistentAllocations` descending. Omit for execution order.'
          ),
        search: z
          .string()
          .optional()
          .describe(
            "Substring search over span name and category, applied to the whole subtree below `parent`. Each match's `id` is the full path from `parent`, so it can be passed straight back as `parent`. Comma-separated terms are ANDed."
          ),
        maxDepth: z
          .number()
          .optional()
          .describe(
            'Levels to descend below `parent` for `search` and `depth`. Default 32, which is also the cap.'
          ),
        depth: z
          .number()
          .optional()
          .describe(
            "Levels of descendants to include inline in each span's `children`. Default 1 (no nesting)."
          ),
        page: z.number().optional().describe('1-based page number. Default 1.'),
        pageSize: z
          .number()
          .optional()
          .describe('Spans per page. Default 20, capped at 500.'),
        outputType: z
          .enum(['markdown', 'json'])
          .optional()
          .describe(
            'Output format. "markdown" (default) returns human-readable markdown. "json" returns structured JSON with all span fields.'
          ),
      },
    },
    (args) => {
      const result = bindings.turbo.queryTraceSpans(handle, {
        parent: args.parent,
        aggregated: args.aggregated ?? true,
        sort: args.sort,
        search: args.search,
        maxDepth: args.maxDepth,
        depth: args.depth,
        page: args.page ?? 1,
        pageSize: args.pageSize,
      })

      const { spans, page, totalPages, totalCount } = result

      if (args.outputType === 'json') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ spans, page, totalPages, totalCount }),
            },
          ],
        }
      }

      const parentLabel = args.parent
        ? `children of ID \`${args.parent}\``
        : 'root level'
      let md = `## Spans at ${parentLabel} — Page ${page} of ${totalPages} (${totalCount} total)\n\n`

      if (spans.length === 0) {
        md += '_No spans found._\n'
      }

      const showAllocations = hasAllocationData(spans)
      for (const span of spans) {
        md += renderSpanMarkdown(span, showAllocations)
      }

      if (page < totalPages) {
        md += `Use \`page=${page + 1}\` to see more results.\n`
      }

      return { content: [{ type: 'text', text: md }] }
    }
  )

  // Start the HTTP server for MCP (served at /mcp).
  const server = http.createServer(async (req, res) => {
    if (req.url !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found. MCP endpoint is at /mcp\n')
      return
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    try {
      res.on('close', () => transport.close())
      await mcpServer.connect(transport)
      let body = ''
      req.setEncoding('utf8')
      await new Promise<void>((resolve, reject) => {
        req.on('data', (chunk: string) => {
          body += chunk
        })
        req.on('end', resolve)
        req.on('error', reject)
      })
      await transport.handleRequest(
        req,
        res,
        body ? JSON.parse(body) : undefined
      )
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, {
          'Content-Type': 'application/json; charset=utf-8',
        })
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Internal server error' },
            id: null,
          })
        )
      }
    }
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Error: MCP port ${httpPort} is already in use. Use --mcp-port to specify a different port.`
      )
    } else {
      console.error(`Error starting MCP server: ${err.message}`)
    }
    process.exit(1)
  })

  server.listen(httpPort, '127.0.0.1', () => {
    console.log(
      `Query this trace from the command line: next internal query-trace --help --port ${httpPort}`
    )
    console.log(
      `Alternatively, connect an MCP client to http://127.0.0.1:${httpPort}/mcp`
    )
  })
}
