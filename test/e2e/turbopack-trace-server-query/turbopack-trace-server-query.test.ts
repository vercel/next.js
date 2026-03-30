/**
 * E2E test for `next internal trace` + `next internal query-trace`.
 *
 * Flow:
 *  1. Start the Next.js app with `NEXT_TURBOPACK_TRACING=1`.
 *     - In dev mode:  the dev server compiles on first request; we trigger
 *       that by fetching `/` so trace data is written.
 *     - In start mode: the build already produced the trace file.
 *  2. Wait for the trace file to appear at `.next/trace-turbopack`.
 *  3. Run `next internal trace <file> --mcp-port <port>` in the background.
 *  4. Wait 5 seconds for the trace server to load and parse the trace.
 *  5. Run several `next internal query-trace` and HTTP MCP queries.
 *  6. Verify the response structure contains real trace data.
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
 * The transport responds with Server-Sent Events; we find the first `data:`
 * line that contains a `result.content[].text` field.
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

// ─── test suite ──────────────────────────────────────────────────────────────

describe('turbopack-trace-server-query', () => {
  if (isNextDeploy) {
    it('skipped for deploy mode', () => {})
    return
  }

  const { next, isTurbopack, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    // Enable Turbopack tracing during build and dev so a trace file is written.
    env: { NEXT_TURBOPACK_TRACING: '1' },
    skipDeployment: true,
  })

  if (skipped) return

  let traceServerProcess: ChildProcess | undefined
  let mcpPort: number

  beforeAll(async () => {
    if (!isTurbopack) return

    // For dev: trigger compilation by serving the root route so the trace
    // file contains real span data before we start the trace server.
    if (isNextDev) {
      const res = await next.fetch('/')
      if (res.status !== 200) {
        throw new Error(`Dev server returned ${res.status} for /`)
      }
    }

    // Wait for the trace file to appear (dev writes it asynchronously;
    // start mode already has it after the build).
    const traceFile = path.join(next.testDir, next.distDir, 'trace-turbopack')
    await retry(
      async () => {
        if (!existsSync(traceFile)) {
          throw new Error(`Trace file not found yet: ${traceFile}`)
        }
      },
      10_000,
      500
    )

    // Allocate a port and start `next internal trace` in the background.
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

    // Wait 5 seconds for the trace server to fully read and parse the trace
    // file before queries are made.
    await new Promise<void>((resolve) => setTimeout(resolve, 5_000))

    // Confirm the MCP HTTP endpoint is up and responding.
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
        if (res.status < 200) {
          throw new Error(`MCP server not ready (HTTP ${res.status})`)
        }
      },
      10_000,
      500
    )
  }, 90_000)

  afterAll(async () => {
    if (traceServerProcess?.pid) {
      await new Promise<void>((resolve) => {
        treeKill(traceServerProcess!.pid!, 'SIGKILL', () => resolve())
      })
      traceServerProcess = undefined
    }
  })

  it('should return root-level spans from a real trace', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    const md = await callMcpTool(mcpPort, 'query_spans', { sort: true })
    // Must be a valid page header.
    expect(md).toContain('## Spans at root level')
    expect(md).toMatch(/Page \d+ of \d+ \(\d+ total\)/)
    // At least one span with an ID and duration info.
    expect(md).toMatch(/ID: `[a-z0-9-]+`/)
    expect(md).toMatch(/CPU Duration|Corrected Duration/)
  })

  it('should drill into children of the top span', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    // Get the ID of the top span at the root level.
    const rootMd = await callMcpTool(mcpPort, 'query_spans', { sort: true })
    const idMatch = rootMd.match(/ID: `([a-z0-9-]+)` *\)/)
    expect(idMatch).not.toBeNull()
    const spanId = idMatch![1]

    // Query children.
    const childMd = await callMcpTool(mcpPort, 'query_spans', {
      parent: spanId,
    })
    expect(childMd).toContain(`children of ID \`${spanId}\``)
    expect(childMd).toMatch(/Page \d+ of \d+/)
  })

  it('should return no spans for an impossible search term', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    const md = await callMcpTool(mcpPort, 'query_spans', {
      search: 'zzz_no_such_span_zzz',
    })
    expect(md).toContain('0 total')
  })

  // ─── CLI ────────────────────────────────────────────────────────────────────

  it('CLI: should return root-level spans', async () => {
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
    expect(stdout).toMatch(/ID: `[a-z0-9-]+`/)
    expect(stdout).toMatch(/CPU Duration|Corrected Duration/)
  })

  it('CLI: should drill into children via --parent', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }
    // Get the top span ID via the HTTP API.
    const rootMd = await callMcpTool(mcpPort, 'query_spans', { sort: true })
    const idMatch = rootMd.match(/ID: `([a-z0-9-]+)` *\)/)
    expect(idMatch).not.toBeNull()
    const spanId = idMatch![1]

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

  it('CLI: --no-aggregated should list individual raw spans', async () => {
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
})
