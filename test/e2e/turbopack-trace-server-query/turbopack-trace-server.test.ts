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

type SpanData = {
  id: string
  name: string
  [key: string]: unknown
}

type QuerySpansResult = {
  spans: SpanData[]
  page: number
  totalPages: number
  totalCount: number
}

/** Call query_spans with outputType:'json' and return the parsed result. */
async function querySpansJson(
  port: number,
  args: Record<string, unknown> = {}
): Promise<QuerySpansResult> {
  const text = await callMcpTool(port, 'query_spans', {
    ...args,
    outputType: 'json',
  })
  return JSON.parse(text)
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
      { stdio: 'pipe' }
    )
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    proc.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    proc.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }))
  })
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

  // Error-path test: does not need turbopack or a running trace server.
  it('CLI: should show an error when the trace server is not running', async () => {
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

  // Skip turbopack-specific tests for non-turbopack builds.
  if (!isTurbopack) return

  let traceServerProcess: ChildProcess | undefined
  let mcpPort: number

  beforeAll(async () => {
    // In dev mode, trigger compilation so the trace file has real span data.
    if (isNextDev) {
      const res = await next.fetch('/')
      if (res.status !== 200) {
        throw new Error(`Dev server returned ${res.status} for /`)
      }
    }

    // Wait for the trace file to appear.
    // Since Next.js 16.2.1-canary.25, trace is written to .next-profiles/ instead of distDir.
    // Fall back to distDir for compatibility with older locally-installed binaries.
    const traceFileNewPath = path.join(
      next.testDir,
      '.next-profiles',
      'trace-turbopack.bin'
    )
    const traceFileOldPath = path.join(
      next.testDir,
      next.distDir,
      'trace-turbopack'
    )
    let traceFile: string = traceFileNewPath
    await retry(
      async () => {
        if (existsSync(traceFileNewPath)) {
          traceFile = traceFileNewPath
        } else if (existsSync(traceFileOldPath)) {
          traceFile = traceFileOldPath
        } else {
          throw new Error(
            `Trace file not found yet: tried ${traceFileNewPath} and ${traceFileOldPath}`
          )
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
      { stdio: 'inherit' }
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
    const md = await callMcpTool(mcpPort, 'query_spans', {})
    expect(md).toContain('## Spans at root level')
    expect(md).toMatch(/ID: `[a-z0-9-]+`/)
    expect(md).toMatch(/CPU Duration|Corrected Duration/)
  })

  it('should support aggregated mode (default) grouping spans by name', async () => {
    const md = await callMcpTool(mcpPort, 'query_spans', { aggregated: true })
    expect(md).toContain('## Spans at root level')
    expect(md).toMatch(/###/)
  })

  it('should support pagination', async () => {
    const md = await callMcpTool(mcpPort, 'query_spans', { page: 1 })
    expect(md).toMatch(/Page \d+ of \d+/)
    expect(md).toMatch(/\d+ total/)
  })

  it('should drill into children of a span using its ID', async () => {
    const { spans } = await querySpansJson(mcpPort, { sort: 'value' })
    const spanId = spans[0].id

    const childMd = await callMcpTool(mcpPort, 'query_spans', {
      parent: spanId,
    })
    expect(childMd).toContain(`children of ID \`${spanId}\``)
    expect(childMd).toMatch(/Page \d+ of \d+/)
  })

  it('should return no results for an impossible search term', async () => {
    const md = await callMcpTool(mcpPort, 'query_spans', {
      search: 'zzz_unlikely_span_name_zzz',
    })
    expect(md).toMatch(/\b0 total/)
  })

  it('should return results when searching for a real span name', async () => {
    // Get a real span name from the root level via JSON output.
    const { spans } = await querySpansJson(mcpPort, { sort: 'value' })
    const searchTerm = spans[0].name.slice(0, 20)

    const md = await callMcpTool(mcpPort, 'query_spans', {
      search: searchTerm,
    })
    // Should find at least the span we took the name from.
    expect(md).not.toMatch(/\b0 total/)
    expect(md).toMatch(/###/)
  })

  it('should support sort by value', async () => {
    const md = await callMcpTool(mcpPort, 'query_spans', { sort: 'value' })
    expect(md).toContain('## Spans at root level')
    expect(md).toMatch(/###/)
  })

  it('should support sort by name', async () => {
    const md = await callMcpTool(mcpPort, 'query_spans', { sort: 'name' })
    expect(md).toContain('## Spans at root level')
    expect(md).toMatch(/###/)
  })

  it('should return JSON when outputType is json', async () => {
    const data = await querySpansJson(mcpPort)
    expect(Array.isArray(data.spans)).toBe(true)
    expect(data.spans.length).toBeGreaterThan(0)
    expect(data).toHaveProperty('page')
    expect(data).toHaveProperty('totalPages')
    expect(data).toHaveProperty('totalCount')
    // Each span should have the expected fields.
    const span = data.spans[0]
    expect(span).toHaveProperty('id')
    expect(span).toHaveProperty('name')
    expect(span).toHaveProperty('cpuDuration')
    expect(span).toHaveProperty('correctedDuration')
    expect(span).toHaveProperty('isAggregated')
  })

  // ─── allocation metadata ─────────────────────────────────────────────────

  it('should include allocation metadata on every span in JSON output', async () => {
    const { spans } = await querySpansJson(mcpPort, { sort: 'value' })
    expect(spans.length).toBeGreaterThan(0)

    for (const span of spans) {
      for (const field of [
        'allocations',
        'deallocations',
        'persistentAllocations',
        'allocationCount',
        'selfAllocations',
        'selfDeallocations',
        'selfPersistentAllocations',
        'selfAllocationCount',
      ]) {
        expect(span).toHaveProperty(field)
        expect(typeof span[field]).toBe('number')
        expect(span[field]).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('should sort by allocations descending', async () => {
    const { spans } = await querySpansJson(mcpPort, { sort: 'allocations' })
    const values = spans.map((s) => s.allocations as number)
    expect(values).toEqual([...values].sort((a, b) => b - a))
  })

  it('should sort by persistent-allocations descending', async () => {
    const { spans } = await querySpansJson(mcpPort, {
      sort: 'persistent-allocations',
    })
    const values = spans.map((s) => s.persistentAllocations as number)
    expect(values).toEqual([...values].sort((a, b) => b - a))
  })

  it('should include allocation metadata for raw (non-aggregated) spans', async () => {
    const { spans } = await querySpansJson(mcpPort, { aggregated: false })
    expect(spans.length).toBeGreaterThan(0)
    for (const span of spans) {
      expect(typeof span.allocations).toBe('number')
      expect(typeof span.persistentAllocations).toBe('number')
    }
  })

  it('should render an allocations section in markdown', async () => {
    const md = await callMcpTool(mcpPort, 'query_spans', {
      sort: 'allocations',
    })
    expect(md).toContain('**Allocations:**')
    expect(md).toMatch(/- \*\*Allocated:\*\* .+ \(self .+\)/)
    expect(md).toMatch(
      /- \*\*Persistent \(ranking signal, not retained\):\*\* .+ \(self .+\)/
    )
    expect(md).toMatch(/- \*\*Allocation Count:\*\* .+ \(self .+\)/)
  })

  it('should expose a precomputed memory summary matching the raw samples', async () => {
    const { spans } = await querySpansJson(mcpPort, { sort: 'value' })
    const withSamples = spans.find(
      (s) => (s.memorySamples as number[][] | undefined)?.length
    )
    if (!withSamples) {
      // Traces from very short builds can contain no memory samples at all.
      return
    }

    const samples = withSamples.memorySamples as number[][]
    const summary = withSamples.memorySummary as {
      count: number
      start: number
      end: number
      min: number
      peak: number
      maxPressure: number
    }
    expect(summary).toBeDefined()
    expect(summary.count).toBe(samples.length)
    expect(summary.start).toBe(samples[0][1])
    expect(summary.end).toBe(samples[samples.length - 1][1])
    expect(summary.peak).toBe(Math.max(...samples.map((x) => x[1])))
    expect(summary.min).toBe(Math.min(...samples.map((x) => x[1])))
  })

  // ─── recursive search ────────────────────────────────────────────────────

  it('should find spans nested below the queried level', async () => {
    // Walk two levels down to find a name that is not a direct child of root.
    const { spans: roots } = await querySpansJson(mcpPort, { sort: 'value' })
    const { spans: level2 } = await querySpansJson(mcpPort, {
      parent: roots[0].id,
      sort: 'value',
    })
    if (level2.length === 0) return
    const { spans: level3 } = await querySpansJson(mcpPort, {
      parent: level2[0].id,
      sort: 'value',
    })
    if (level3.length === 0) return

    const deepName = level3[0].name
    const rootNames = new Set(roots.map((s) => s.name))
    if (rootNames.has(deepName)) {
      // This name also exists at the root, so it wouldn't prove recursion.
      return
    }

    // Searching from the root must still reach it.
    const { spans: found } = await querySpansJson(mcpPort, {
      search: deepName,
    })
    expect(found.length).toBeGreaterThan(0)
    expect(found.some((s) => s.name.includes(deepName))).toBe(true)
  })

  it('should return search results with navigable full-path IDs', async () => {
    const { spans: roots } = await querySpansJson(mcpPort, { sort: 'value' })
    const { spans: level2 } = await querySpansJson(mcpPort, {
      parent: roots[0].id,
      sort: 'value',
    })
    if (level2.length === 0) return

    const { spans: found } = await querySpansJson(mcpPort, {
      search: level2[0].name,
    })
    expect(found.length).toBeGreaterThan(0)

    // Every returned ID must be usable as a `parent` in a follow-up call.
    const nested = found.find((s) => s.id.includes('-'))
    if (nested) {
      const result = await querySpansJson(mcpPort, { parent: nested.id })
      expect(result).toHaveProperty('totalCount')
      expect(result.totalCount).toBeGreaterThanOrEqual(0)
    }
  })

  it('should not change result membership based on sort mode', async () => {
    // Sorting reorders; it must never filter.
    const byValue = await querySpansJson(mcpPort, { sort: 'value' })
    const byName = await querySpansJson(mcpPort, { sort: 'name' })
    const byAllocations = await querySpansJson(mcpPort, { sort: 'allocations' })

    expect(byName.totalCount).toBe(byValue.totalCount)
    expect(byAllocations.totalCount).toBe(byValue.totalCount)
  })

  // ─── subtree depth ───────────────────────────────────────────────────────

  it('should return nested children inline when depth > 1', async () => {
    const flat = await querySpansJson(mcpPort, { sort: 'value' })
    expect(flat.spans[0].children).toEqual([])

    const nested = await querySpansJson(mcpPort, { sort: 'value', depth: 3 })
    const top = nested.spans[0]
    const children = top.children as SpanData[]

    // The same top-level span, now carrying its subtree.
    expect(top.id).toBe(flat.spans[0].id)
    if (children.length === 0) return

    // Nested IDs extend the parent's path, so they stay navigable.
    expect(children[0].id.startsWith(top.id)).toBe(true)

    // Nested children must match what a direct drill-down returns.
    const drilled = await querySpansJson(mcpPort, {
      parent: top.id,
      sort: 'value',
    })
    expect(children.map((c) => c.id)).toEqual(
      drilled.spans.slice(0, children.length).map((c) => c.id)
    )
  })

  // ─── page size ───────────────────────────────────────────────────────────

  it('should honor pageSize and cap it', async () => {
    const wide = await querySpansJson(mcpPort, {
      aggregated: false,
      pageSize: 100,
    })
    expect(wide.spans.length).toBeLessThanOrEqual(100)

    const narrow = await querySpansJson(mcpPort, {
      aggregated: false,
      pageSize: 1,
    })
    expect(narrow.spans.length).toBe(1)
    expect(narrow.totalCount).toBe(wide.totalCount)
    // A smaller page over the same set means more pages.
    expect(narrow.totalPages).toBeGreaterThanOrEqual(wide.totalPages)
  })

  // ─── heaviest span ───────────────────────────────────────────────────────

  it('should point heaviestSpanId at the group member holding the most bytes', async () => {
    // Multi-member groups do not always exist at the root, so descend until one
    // turns up. Whether a given trace has one depends on what was compiled.
    const isGroup = (s: SpanData) =>
      s.isAggregated && (s.count as number) > 1 && s.heaviestSpanId
    let frontier = (await querySpansJson(mcpPort, { sort: 'value' })).spans
    let group: SpanData | undefined
    for (let level = 0; level < 4 && !group && frontier.length > 0; level++) {
      group = frontier.find(isGroup)
      if (group) break
      const next: SpanData[] = []
      for (const span of frontier.slice(0, 5)) {
        next.push(
          ...(await querySpansJson(mcpPort, { parent: span.id, sort: 'value' }))
            .spans
        )
      }
      frontier = next
    }
    if (!group) return

    const heaviestId = group.heaviestSpanId as string
    const firstId = group.firstSpanId as string

    // Look the group's members up as raw spans and check that the one
    // heaviestSpanId names really does hold the most persistent bytes.
    const { spans: members } = await querySpansJson(mcpPort, {
      parent: group.id,
      aggregated: false,
      pageSize: 500,
    })
    const byIndex = new Map(
      members.map((m) => [m.id.split('-').pop() as string, m])
    )
    const heaviest = byIndex.get(heaviestId)
    const first = byIndex.get(firstId)
    if (!heaviest || !first) return

    expect(heaviest.persistentAllocations as number).toBeGreaterThanOrEqual(
      first.persistentAllocations as number
    )
    const max = Math.max(
      ...members.map((m) => m.persistentAllocations as number)
    )
    expect(heaviest.persistentAllocations as number).toBe(max)
  })

  // ─── CLI tests ───────────────────────────────────────────────────────────

  it('CLI: should return root-level spans', async () => {
    const { stdout, exitCode } = await runQueryTraceCli([
      '--port',
      String(mcpPort),
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('## Spans at root level')
    expect(stdout).toMatch(/ID: `[a-z0-9-]+`/)
    expect(stdout).toMatch(/CPU Duration|Corrected Duration/)
  })

  it('CLI: should support --sort value flag', async () => {
    const { stdout, exitCode } = await runQueryTraceCli([
      '--port',
      String(mcpPort),
      '--sort',
      'value',
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('## Spans at root level')
    expect(stdout).toMatch(/###/)
  })

  it('CLI: should support --sort name flag', async () => {
    const { stdout, exitCode } = await runQueryTraceCli([
      '--port',
      String(mcpPort),
      '--sort',
      'name',
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('## Spans at root level')
    expect(stdout).toMatch(/###/)
  })

  it('CLI: should support --sort allocations flag', async () => {
    const { stdout, exitCode } = await runQueryTraceCli([
      '--port',
      String(mcpPort),
      '--sort',
      'allocations',
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('## Spans at root level')
    expect(stdout).toMatch(/###/)
  })

  it('CLI: should support --search flag with a real match', async () => {
    // Get a real span name to search for via JSON output.
    const { spans } = await querySpansJson(mcpPort, { sort: 'value' })
    const searchTerm = spans[0].name.slice(0, 20)

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
    const { spans } = await querySpansJson(mcpPort, { sort: 'value' })
    const spanId = spans[0].id

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
})
