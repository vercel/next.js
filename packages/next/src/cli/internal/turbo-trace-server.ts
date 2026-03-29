import http from 'node:http'
import z from 'next/dist/compiled/zod'
import { loadBindings } from '../../build/swc'

const { McpServer } =
  require('next/dist/compiled/@modelcontextprotocol/sdk/server/mcp') as typeof import('next/dist/compiled/@modelcontextprotocol/sdk/server/mcp')
const { StreamableHTTPServerTransport } =
  require('next/dist/compiled/@modelcontextprotocol/sdk/server/streamableHttp') as typeof import('next/dist/compiled/@modelcontextprotocol/sdk/server/streamableHttp')

const DEFAULT_WS_PORT = 5747
const DEFAULT_MCP_PORT = 5748

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

export async function startTurboTraceServerCli(
  file: string,
  port: number | undefined,
  mcpPort: number | undefined
) {
  const wsPort = port ?? DEFAULT_WS_PORT
  const httpPort = mcpPort ?? DEFAULT_MCP_PORT

  const bindings = await loadBindings()

  // Start the WebSocket trace server on a background thread (non-blocking).
  const handle = bindings.turbo.startTurbopackTraceServerHandle(file, wsPort)

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
      description:
        'Query spans from a turbopack trace file. Returns a markdown-formatted list of spans with timing, CPU usage, and attribute details. Use the `parent` parameter (with an ID from a previous result) to drill into children. Results are paginated to 20 spans per page.',
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
          .boolean()
          .optional()
          .describe(
            'When true, sort results by corrected duration descending. Default false.'
          ),
        search: z
          .string()
          .optional()
          .describe(
            'Substring search query applied to span name and category.'
          ),
        page: z.number().optional().describe('1-based page number. Default 1.'),
      },
    },
    (args) => {
      const result = bindings.turbo.queryTraceSpans(handle, {
        parent: args.parent,
        aggregated: args.aggregated ?? true,
        sort: args.sort ?? false,
        search: args.search,
        page: args.page ?? 1,
      })

      const { spans, page, totalPages, totalCount } = result

      const parentLabel = args.parent
        ? `children of ID \`${args.parent}\``
        : 'root level'
      let md = `## Spans at ${parentLabel} — Page ${page} of ${totalPages} (${totalCount} total)\n\n`

      if (spans.length === 0) {
        md += '_No spans found._\n'
      }

      for (const span of spans) {
        md += `### \`${span.name}\` (ID: \`${span.id}\`)\n`

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
          md += `\n#### First span as example (ID: \`${span.id}\`)\n`
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

        md += '\n---\n\n'
      }

      if (page < totalPages) {
        md += `Use \`page=${page + 1}\` to see more results.\n`
      }

      return { content: [{ type: 'text', text: md }] }
    }
  )

  // Start the HTTP server for MCP.
  const server = http.createServer(async (req, res) => {
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

  server.listen(httpPort, '127.0.0.1', () => {
    console.log(
      `Trace server MCP endpoint started at http://127.0.0.1:${httpPort}/`
    )
    console.log(
      `To query this trace server from the command line, run: next internal query-trace --help`
    )
  })
}
