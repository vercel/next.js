/**
 * End-to-end test for the turbopack trace server MCP API.
 *
 * This test:
 *  1. Builds a Next.js app with `NEXT_TURBOPACK_TRACING=1` to produce a trace file.
 *  2. Spawns `next internal trace <file> --mcp-port <port>` as a background process.
 *  3. Sends MCP `tools/call` requests over HTTP to the `query_spans` tool.
 *  4. Verifies the structured markdown response contains expected trace data.
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
 * Run `next internal query-trace` with the given extra arguments and return
 * the captured stdout, stderr, and exit code.
 */
function runQueryTraceCli(
  extraArgs: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(
      'node',
      ['--no-deprecation', nextBin, 'internal', 'query-trace', ...extraArgs],
      {
        env: { ...process.env, __NEXT_TEST_MODE: 'e2e' },
        stdio: 'pipe',
      }
    )
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    })
  })
}

/**
 * Call a tool on the MCP server and return the text content of the response.
 *
 * The MCP Streamable-HTTP transport responds with Server-Sent Events (SSE).
 * Each event is:
 *   event: message
 *   data: <JSON-RPC response JSON>
 *
 * The connection is closed by the server after sending the response.
 */
async function callMcpTool(
  port: number,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/`, {
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

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  }

  const body = await res.text()

  // Parse SSE: find "data: <json>" lines and extract the result text.
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const msg = JSON.parse(line.slice('data: '.length)) as {
      result?: { content?: Array<{ type: string; text?: string }> }
      error?: unknown
    }
    if (msg.error) {
      throw new Error(`MCP error: ${JSON.stringify(msg.error)}`)
    }
    const text = msg.result?.content?.find((c) => c.type === 'text')?.text
    if (text !== undefined) return text
  }

  throw new Error(`No text content in MCP response:\n${body}`)
}

// ─── test suite ──────────────────────────────────────────────────────────────

describe('turbopack-trace-server-mcp', () => {
  // This test requires a Turbopack production build.
  // It is skipped in deploy mode and when running with webpack.
  if (isNextDeploy) {
    it('skipped for deploy mode', () => {})
    return
  }

  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) return

  let traceServerProcess: ChildProcess | undefined
  let mcpPort: number

  beforeAll(async () => {
    if (!isTurbopack) return

    // 1. Build with Turbopack tracing enabled.
    const buildResult = await next.build({
      env: { NEXT_TURBOPACK_TRACING: '1' },
    })
    if (buildResult.exitCode !== 0) {
      throw new Error(
        `Build failed with exit code ${buildResult.exitCode}:\n${buildResult.cliOutput}`
      )
    }

    // 2. Verify the trace file was produced.
    const traceFile = path.join(next.testDir, '.next', 'trace-turbopack')
    if (!existsSync(traceFile)) {
      throw new Error(`Trace file not found: ${traceFile}`)
    }

    // 3. Allocate a port and start the trace server with an MCP endpoint.
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
      {
        env: { ...process.env, __NEXT_TEST_MODE: 'e2e' },
        stdio: 'pipe',
      }
    )

    traceServerProcess.stderr?.on('data', (chunk) => {
      process.stderr.write(chunk)
    })
    traceServerProcess.stdout?.on('data', (chunk) => {
      process.stdout.write(chunk)
    })

    // 4. Wait for the MCP HTTP server to be ready.
    await retry(
      async () => {
        const res = await fetch(`http://127.0.0.1:${mcpPort}/`, {
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
        // Any HTTP response (even an error body) means the server is up.
        expect(res.status).toBeGreaterThanOrEqual(200)
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

  it('should return root-level spans in markdown format', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }

    const md = await callMcpTool(mcpPort, 'query_spans', {})

    // The response should be a markdown document listing spans.
    expect(md).toContain('## Spans at root level')
    // Spans should include timing and ID information.
    // IDs may be plain numbers (raw spans) or "a"-prefixed (aggregated spans),
    // and can include path segments separated by "-", e.g. "a1", "a5-a34-20".
    expect(md).toMatch(/ID: `[a-z0-9-]+`/)
    // CPU and corrected duration should be present.
    expect(md).toMatch(/CPU Duration|Corrected Duration/)
  })

  it('should support aggregated mode (default) grouping spans by name', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }

    const md = await callMcpTool(mcpPort, 'query_spans', { aggregated: true })

    expect(md).toContain('## Spans at root level')
    // At least one span should be present.
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

    // First, get a span ID from the root level.
    const rootMd = await callMcpTool(mcpPort, 'query_spans', {
      sort: true,
    })

    // Extract the first span ID from the markdown (format: plain number or "a"-prefixed, possibly path like "a5-a12-34").
    const idMatch = rootMd.match(/ID: `([a-z0-9-]+)` *\)/)
    expect(idMatch).not.toBeNull()
    const spanId = idMatch![1]

    // Now query children of that span.
    const childMd = await callMcpTool(mcpPort, 'query_spans', {
      parent: spanId,
    })

    expect(childMd).toContain(`children of ID \`${spanId}\``)
    // The response should be a valid page header even if there are no children.
    expect(childMd).toMatch(/Page \d+ of \d+/)
  })

  it('should support search filtering', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }

    // Search for a term unlikely to match anything.
    const noMatchMd = await callMcpTool(mcpPort, 'query_spans', {
      search: 'zzz_unlikely_span_name_zzz',
    })

    expect(noMatchMd).toContain('0 total')
  })

  it('should support sort by duration', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }

    const md = await callMcpTool(mcpPort, 'query_spans', { sort: true })

    // Should still return valid markdown.
    expect(md).toContain('## Spans at root level')
    expect(md).toMatch(/###/)
  })

  // ─── CLI tests ─────────────────────────────────────────────────────────────

  it('CLI: should return root-level spans via `next internal query-trace`', async () => {
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

  it('CLI: should support --search flag', async () => {
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
    expect(stdout).toContain('0 total')
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
    expect(stdout).toMatch(/ID: `[a-z0-9-]+`/)
  })

  it('CLI: should support --parent to drill into children', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }

    // Get a span ID from the root level using the HTTP API.
    const rootMd = await callMcpTool(mcpPort, 'query_spans', { sort: true })
    const idMatch = rootMd.match(/ID: `([a-z0-9-]+)` *\)/)
    expect(idMatch).not.toBeNull()
    const spanId = idMatch![1]

    // Query children via the CLI.
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

  it('CLI: should show an error and instructions when the trace server is not running', async () => {
    // Use a port with no server listening on it.
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
