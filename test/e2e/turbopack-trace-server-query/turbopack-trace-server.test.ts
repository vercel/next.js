/**
 * E2E test for the turbopack trace server MCP API and CLI.
 *
 * Flow:
 *  1. Start the Next.js app with `NEXT_TURBOPACK_TRACING=1`.
 *     - In dev mode: fetches `/` to trigger compilation so trace data is written.
 *     - In start mode: the build already produced the trace file.
 *  2. Wait for the trace file to appear.
 *  3. Spawn `next internal trace <file> --mcp-port <port>` in the background.
 *  4. Wait for the MCP HTTP server to be ready.
 *  5. Run MCP HTTP and CLI queries and verify the response structure.
 */
import { nextTestSetup, isNextDeploy } from 'e2e-utils'
import { existsSync } from 'fs'
import path from 'path'
import spawn from 'cross-spawn'
import type { ChildProcess } from 'child_process'
import treeKill from 'tree-kill'
import { findPort, retry } from 'next-test-utils'

// ─── helpers ─────────────────────────────────────────────────────────────────

const nextBin = path.join(
  path.dirname(require.resolve('next/package')),
  'dist/bin/next'
)

/**
 * POST a JSON-RPC `tools/call` to the MCP server and return the text content.
 * The Streamable-HTTP transport responds with Server-Sent Events; we find the
 * first `data:` line that contains a `result.content[].text` field.
 */
async function callMcpTool(
  port: number,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: args },
      id: 1,
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  const body = await res.text()
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const msg = JSON.parse(line.slice('data: '.length)) as {
      result?: { content?: Array<{ type: string; text?: string }> }
      error?: unknown
    }
    if (msg.error) throw new Error(`MCP error: ${JSON.stringify(msg.error)}`)
    const text = msg.result?.content?.find((c) => c.type === 'text')?.text
    if (text !== undefined) return text
  }
  throw new Error(`No text content in MCP response:\n${body}`)
}

/**
 * Run `next internal query-trace` with the given extra arguments.
 * Returns captured stdout, stderr, and exit code.
 */
function runQueryTraceCli(
  extraArgs: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(
      'node',
      ['--no-deprecation', nextBin, 'internal', 'query-trace', ...extraArgs],
      { env: { ...process.env, __NEXT_TEST_MODE: 'e2e' }, stdio: 'pipe' }
    )
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    proc.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    proc.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }))
  })
}

/** Extract the first span ID from a markdown response. */
function extractFirstSpanId(md: string): string {
  const m = md.match(/ID: `([a-z0-9-]+)`/)
  if (!m) throw new Error(`No span ID found in markdown:\n${md.slice(0, 500)}`)
  return m[1]
}

// ─── test suite ──────────────────────────────────────────────────────────────

describe('turbopack-trace-server', () => {
  if (isNextDeploy) {
    it('skipped for deploy mode', () => {})
    return
  }

  const { next, isTurbopack, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    env: { NEXT_TURBOPACK_TRACING: '1' },
    skipDeployment: true,
  })

  if (skipped) return

  let traceServerProcess: ChildProcess | undefined
  let mcpPort: number

  beforeAll(async () => {
    if (!isTurbopack) return

    // In dev mode, trigger compilation so the trace file has real span data.
    if (isNextDev) {
      const res = await next.fetch('/')
      if (res.status !== 200) {
        throw new Error(`Dev server returned ${res.status} for /`)
      }
    }

    // Wait for the trace file to appear.
    const traceFile = path.join(next.testDir, next.distDir, 'trace-turbopack')
    await retry(
      async () => {
        if (!existsSync(traceFile)) {
          throw new Error(`Trace file not found yet: ${traceFile}`)
        }
      },
      15_000,
      500
    )

    // Allocate a port and start the trace server with an MCP endpoint.
    mcpPort = await findPort()
    traceServerProcess = spawn(
      'node',
      [
        '--no-deprecation',
        nextBin,
        'internal',
        'trace',
        traceFile,
        '--mcp-port',
        String(mcpPort),
      ],
      { env: { ...process.env, __NEXT_TEST_MODE: 'e2e' }, stdio: 'pipe' }
    )
    traceServerProcess.stdout?.on('data', (chunk) =>
      process.stdout.write(chunk)
    )
    traceServerProcess.stderr?.on('data', (chunk) =>
      process.stderr.write(chunk)
    )

    // Wait for the MCP HTTP server to be ready.
    await retry(
      async () => {
        const res = await fetch(`http://127.0.0.1:${mcpPort}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/list',
            id: 0,
          }),
        })
        if (res.status >= 500) {
          throw new Error(`MCP server not ready (HTTP ${res.status})`)
        }
      },
      30_000,
      500
    )
  }, 120_000)

  afterAll(async () => {
    if (traceServerProcess?.pid) {
      await new Promise<void>((resolve) => {
        treeKill(traceServerProcess!.pid!, 'SIGKILL', () => resolve())
      })
      traceServerProcess = undefined
    }
  })

  // ─── MCP HTTP API tests ──────────────────────────────────────────────────

  it('should return root-level spans in markdown format', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    const md = await callMcpTool(mcpPort, 'query_spans', {})
    expect(md).toContain('## Spans at root level')
    expect(md).toMatch(/ID: `[a-z0-9-]+`/)
    expect(md).toMatch(/CPU Duration|Corrected Duration/)
  })

  it('should support aggregated mode (default) grouping spans by name', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    const md = await callMcpTool(mcpPort, 'query_spans', { aggregated: true })
    expect(md).toContain('## Spans at root level')
    expect(md).toMatch(/###/)
  })

  it('should support pagination', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    const md = await callMcpTool(mcpPort, 'query_spans', { page: 1 })
    expect(md).toMatch(/Page \d+ of \d+/)
    expect(md).toMatch(/\d+ total/)
  })

  it('should drill into children of a span using its ID', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    const rootMd = await callMcpTool(mcpPort, 'query_spans', { sort: true })
    const spanId = extractFirstSpanId(rootMd)

    const childMd = await callMcpTool(mcpPort, 'query_spans', {
      parent: spanId,
    })
    expect(childMd).toContain(`children of ID \`${spanId}\``)
    expect(childMd).toMatch(/Page \d+ of \d+/)
  })

  it('should return no results for an impossible search term', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    const md = await callMcpTool(mcpPort, 'query_spans', {
      search: 'zzz_unlikely_span_name_zzz',
    })
    expect(md).toMatch(/\b0 total/)
  })

  it('should return results when searching for a real span name', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    // First get a span name from the root level to use as a search term.
    const rootMd = await callMcpTool(mcpPort, 'query_spans', { sort: true })
    // Extract the first span name from the markdown (format: ### `name` (ID: ...))
    const nameMatch = rootMd.match(/### `([^`]+)`/)
    if (!nameMatch) throw new Error('No span name found in root listing')
    // Use a substring of the first span's name as the search query.
    const searchTerm = nameMatch[1].slice(0, 20)

    const md = await callMcpTool(mcpPort, 'query_spans', {
      search: searchTerm,
    })
    // Should find at least the span we took the name from.
    expect(md).not.toMatch(/\b0 total/)
    expect(md).toMatch(/###/)
  })

  it('should support sort by duration', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    const md = await callMcpTool(mcpPort, 'query_spans', { sort: true })
    expect(md).toContain('## Spans at root level')
    expect(md).toMatch(/###/)
  })

  it('should return JSON when outputType is json', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    const text = await callMcpTool(mcpPort, 'query_spans', {
      outputType: 'json',
    })
    const data = JSON.parse(text)
    expect(data).toHaveProperty('spans')
    expect(data).toHaveProperty('page')
    expect(data).toHaveProperty('totalPages')
    expect(data).toHaveProperty('totalCount')
    expect(Array.isArray(data.spans)).toBe(true)
    expect(data.spans.length).toBeGreaterThan(0)
    // Each span should have the expected fields.
    const span = data.spans[0]
    expect(span).toHaveProperty('id')
    expect(span).toHaveProperty('name')
    expect(span).toHaveProperty('cpuDuration')
    expect(span).toHaveProperty('correctedDuration')
    expect(span).toHaveProperty('isAggregated')
  })

  // ─── CLI tests ───────────────────────────────────────────────────────────

  it('CLI: should return root-level spans', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    const { stdout, exitCode } = await runQueryTraceCli([
      '--port',
      String(mcpPort),
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('## Spans at root level')
    expect(stdout).toMatch(/ID: `[a-z0-9-]+`/)
    expect(stdout).toMatch(/CPU Duration|Corrected Duration/)
  })

  it('CLI: should support --sort flag', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    const { stdout, exitCode } = await runQueryTraceCli([
      '--port',
      String(mcpPort),
      '--sort',
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('## Spans at root level')
    expect(stdout).toMatch(/###/)
  })

  it('CLI: should support --search flag with a real match', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    // Get a real span name to search for.
    const rootMd = await callMcpTool(mcpPort, 'query_spans', { sort: true })
    const nameMatch = rootMd.match(/### `([^`]+)`/)
    if (!nameMatch) throw new Error('No span name found in root listing')
    const searchTerm = nameMatch[1].slice(0, 20)

    const { stdout, exitCode } = await runQueryTraceCli([
      '--port',
      String(mcpPort),
      '--search',
      searchTerm,
    ])
    expect(exitCode).toBe(0)
    expect(stdout).not.toMatch(/\b0 total/)
    expect(stdout).toMatch(/###/)
  })

  it('CLI: should support --search flag with no match', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    const { stdout, exitCode } = await runQueryTraceCli([
      '--port',
      String(mcpPort),
      '--search',
      'zzz_unlikely_span_name_zzz',
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/\b0 total/)
  })

  it('CLI: should support --no-aggregated flag', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    const { stdout, exitCode } = await runQueryTraceCli([
      '--port',
      String(mcpPort),
      '--no-aggregated',
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('## Spans at root level')
    // Raw span IDs are plain numbers (no "a" prefix).
    expect(stdout).toMatch(/ID: `\d+`/)
  })

  it('CLI: should support --parent to drill into children', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    const rootMd = await callMcpTool(mcpPort, 'query_spans', { sort: true })
    const spanId = extractFirstSpanId(rootMd)

    const { stdout, exitCode } = await runQueryTraceCli([
      '--port',
      String(mcpPort),
      '--parent',
      spanId,
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain(`children of ID \`${spanId}\``)
    expect(stdout).toMatch(/Page \d+ of \d+/)
  })

  it('CLI: should support --json flag', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    const { stdout, exitCode } = await runQueryTraceCli([
      '--port',
      String(mcpPort),
      '--json',
    ])
    expect(exitCode).toBe(0)
    const data = JSON.parse(stdout)
    expect(data).toHaveProperty('spans')
    expect(data).toHaveProperty('page')
    expect(data).toHaveProperty('totalPages')
    expect(data).toHaveProperty('totalCount')
    expect(Array.isArray(data.spans)).toBe(true)
    expect(data.spans.length).toBeGreaterThan(0)
  })

  it('CLI: should show an error when the trace server is not running', async () => {
    // This test does not need the turbopack guard — it tests the error path.
    const unusedPort = await findPort()
    const { stderr, exitCode } = await runQueryTraceCli([
      '--port',
      String(unusedPort),
    ])
    expect(exitCode).toBe(1)
    expect(stderr).toContain(
      `Could not connect to trace server on port ${unusedPort}`
    )
    expect(stderr).toContain('next internal trace <file>')
    expect(stderr).toContain('next internal query-trace --help')
  })
})
