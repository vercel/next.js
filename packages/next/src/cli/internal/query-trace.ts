/**
 * CLI client for querying a running turbopack trace server via its MCP endpoint.
 * Sends a JSON-RPC `tools/call` request and prints the response to stdout.
 * Use --json for machine-readable JSON output (default: markdown).
 *
 * Usage: next internal query-trace [options]
 */

const DEFAULT_MCP_PORT = 5748 // Keep in sync with turbo-trace-server.ts

interface QueryTraceOptions {
  port: number | undefined
  tool: 'query_spans' | 'flat_profile' | 'memory_timeline' | undefined
  parent: string | undefined
  aggregated: boolean | undefined
  sort: string | undefined
  search: string | undefined
  recursive: boolean | undefined
  maxDepth: number | undefined
  depth: number | undefined
  start: number | undefined
  end: number | undefined
  maxSamples: number | undefined
  maxPhases: number | undefined
  page: number | undefined
  pageSize: number | undefined
  json: boolean | undefined
  fields: string | undefined
}

export async function queryTraceCli(options: QueryTraceOptions): Promise<void> {
  const port = options.port ?? DEFAULT_MCP_PORT

  const tool = options.tool ?? 'query_spans'

  // Build arguments — only include values explicitly set by the user. Each
  // tool validates its own arguments, so options another tool doesn't take
  // are left out rather than rejected.
  const args: Record<string, unknown> = {}
  if (options.parent !== undefined) args.parent = options.parent
  if (options.json) args.outputType = 'json'
  if (tool === 'query_spans' || tool === 'flat_profile') {
    if (options.sort !== undefined) args.sort = options.sort
    if (options.search !== undefined) args.search = options.search
    if (options.page !== undefined) args.page = options.page
    if (options.pageSize !== undefined) args.pageSize = options.pageSize
  }
  if (tool === 'query_spans') {
    if (options.aggregated !== undefined) args.aggregated = options.aggregated
    if (options.recursive !== undefined) args.recursive = options.recursive
    if (options.maxDepth !== undefined) args.maxDepth = options.maxDepth
    if (options.depth !== undefined) args.depth = options.depth
    if (options.fields !== undefined) {
      args.fields = options.fields
        .split(',')
        .map((field) => field.trim())
        .filter(Boolean)
    }
  }
  if (tool === 'memory_timeline') {
    if (options.start !== undefined) args.start = options.start
    if (options.end !== undefined) args.end = options.end
    if (options.maxSamples !== undefined) args.maxSamples = options.maxSamples
    if (options.maxPhases !== undefined) args.maxPhases = options.maxPhases
  }

  const requestBody = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: tool,
      arguments: args,
    },
    id: 1,
  })

  let res: Response
  try {
    res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: requestBody,
    })
  } catch {
    console.error(
      [
        `Error: Could not connect to trace server on port ${port}.`,
        '',
        'Make sure the trace server is running in the background:',
        '',
        `  next internal trace <file> --mcp-port ${port}`,
        '',
        'Then run your query in another terminal. For all available options, see:',
        '',
        '  next internal query-trace --help',
      ].join('\n')
    )
    process.exit(1)
  }

  if (!res.ok) {
    console.error(`Error: MCP server responded with HTTP ${res.status}`)
    process.exit(1)
  }

  const body = await res.text()

  // Parse SSE stream: each event looks like:
  //   event: message
  //   data: <JSON-RPC response JSON>
  //
  // We scan for "data: " lines, parse the JSON, and extract the text content.
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) continue
    let msg: {
      result?: {
        content?: Array<{ type: string; text?: string }>
        isError?: boolean
      }
      error?: unknown
    }
    try {
      msg = JSON.parse(line.slice('data: '.length))
    } catch {
      continue
    }
    if (msg.error) {
      console.error(`Error: MCP tool error: ${JSON.stringify(msg.error)}`)
      process.exit(1)
    }
    const text = msg.result?.content?.find((c) => c.type === 'text')?.text
    if (msg.result?.isError) {
      // e.g. an option the tool's schema rejects, like a `--sort` mode of
      // another tool.
      console.error(`Error: ${text ?? JSON.stringify(msg.result)}`)
      process.exit(1)
    }
    if (text !== undefined) {
      process.stdout.write(text)
      return
    }
  }

  console.error(`Error: No text content in MCP response:\n${body}`)
  process.exit(1)
}
