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
  parent: string | undefined
  aggregated: boolean | undefined
  sort: string | undefined
  search: string | undefined
  page: number | undefined
  json: boolean | undefined
}

export async function queryTraceCli(options: QueryTraceOptions): Promise<void> {
  const port = options.port ?? DEFAULT_MCP_PORT

  // Build arguments — only include values explicitly set by the user.
  const args: Record<string, unknown> = {}
  if (options.parent !== undefined) args.parent = options.parent
  if (options.aggregated !== undefined) args.aggregated = options.aggregated
  if (options.sort !== undefined) args.sort = options.sort
  if (options.search !== undefined) args.search = options.search
  if (options.page !== undefined) args.page = options.page
  if (options.json) args.outputType = 'json'

  const requestBody = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'query_spans',
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
      result?: { content?: Array<{ type: string; text?: string }> }
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
    if (text !== undefined) {
      process.stdout.write(text)
      return
    }
  }

  console.error(`Error: No text content in MCP response:\n${body}`)
  process.exit(1)
}
