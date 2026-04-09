#!/usr/bin/env node
/**
 * Fetch compilation issues from a running Next.js dev server via its MCP
 * endpoint. Prints the tool's raw JSON result to stdout. Cross-platform —
 * uses only Node's built-in fetch (Node 18+; Next.js 16 requires Node 20+).
 *
 * Usage:
 *   node check.mjs <port>
 *
 * Output (stdout, on success):
 *   {"issues":[...]}            no errors when issues array is empty
 *   {"error":"..."}              Turbopack project not available (e.g. webpack)
 *
 * Exit codes:
 *   0  MCP call succeeded; JSON printed to stdout
 *   1  bad invocation, network failure, or unexpected MCP response shape
 *      (details on stderr)
 */

const port = process.argv[2]
if (!port || !/^\d+$/.test(port)) {
  console.error('Usage: node check.mjs <port>')
  process.exit(1)
}

const url = `http://localhost:${port}/_next/mcp`
const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
}

function parseSSE(text) {
  for (const line of text.split('\n')) {
    if (line.startsWith('data:')) {
      return JSON.parse(line.slice(5).trim())
    }
  }
  return null
}

async function post(body) {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`)
  }
  return res.text()
}

try {
  // MCP handshake (re-done on every invocation — endpoint is stateless per call)
  await post({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'check-compilation-skill', version: '1.0.0' },
    },
  })
  await post({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  })

  // Tool call
  const raw = await post({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'get_compilation_issues', arguments: {} },
  })

  const frame = parseSSE(raw)
  if (frame?.error) {
    console.error(`MCP error: ${frame.error.message || frame.error}`)
    process.exit(1)
  }

  const text = frame?.result?.content?.[0]?.text
  if (typeof text !== 'string') {
    console.error('Unexpected MCP response shape')
    process.exit(1)
  }

  // Print the tool result as-is.
  process.stdout.write(text)
  if (!text.endsWith('\n')) process.stdout.write('\n')
} catch (err) {
  console.error(
    `Cannot reach dev server on port ${port}: ${err.message}\n` +
      'Is `next dev` running on that port?'
  )
  process.exit(1)
}
