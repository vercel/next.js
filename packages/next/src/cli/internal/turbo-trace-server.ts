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

/**
 * Render a single span (or aggregated span group) as a markdown section.
 */
function renderSpanMarkdown(span: TraceSpanInfo): string {
  let md = `### \`${span.name}\` (ID: \`${span.id}\`)\n`

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

  md += '\n---\n\n'
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
      description:
        'Query spans from a turbopack trace file. Returns spans with timing, CPU usage, and attribute details. Set `outputType` to "json" for machine-readable output or "markdown" (default) for human-readable output. Use the `parent` parameter (with an ID from a previous result) to drill into children. Results are paginated to 20 spans per page.',
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
          .enum(['value', 'name'])
          .optional()
          .describe(
            'Sort mode: "value" for corrected duration descending, "name" for alphabetical. Omit for execution order.'
          ),
        search: z
          .string()
          .optional()
          .describe(
            'Substring search query applied to span name and category.'
          ),
        page: z.number().optional().describe('1-based page number. Default 1.'),
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
        page: args.page ?? 1,
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

      for (const span of spans) {
        md += renderSpanMarkdown(span)
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
      `Query this trace from the command line: next internal query-trace --help`
    )
    console.log(
      `Alternatively, connect an MCP client to http://127.0.0.1:${httpPort}/mcp`
    )
  })
}
