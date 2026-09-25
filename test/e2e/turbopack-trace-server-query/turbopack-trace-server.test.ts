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
  args: Array<[string, string]>
  [key: string]: unknown
}

/** Strip per-span `name` attributes from the trace server's displayed label. */
function spanType({ name, args }: SpanData): string {
  const nameArg = args.find(([key]) => key === 'name')?.[1]
  if (nameArg) {
    if (
      name.startsWith('turbo_tasks::function ') ||
      name.startsWith('turbo_tasks::resolve_call ') ||
      name.startsWith('turbo_tasks::resolve_trait_call ')
    ) {
      name = name.slice(0, name.indexOf(' '))
    } else if (name.endsWith(` ${nameArg}`)) {
      name = name.slice(0, -nameArg.length - 1)
    }
  }
  const separator = name.indexOf(' ')
  return separator === -1
    ? name
    : `${name.slice(separator + 1)} (${name.slice(0, separator)})`
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

  it('should record the displayed span types and approximate trace size', async () => {
    // An empty search includes nested spans, unlike a root-level query.
    // Disable aggregation so totalCount represents actual emitted spans.
    const spanTypes = new Set<string>()
    let page = 1
    let totalPages: number
    let totalCount: number
    do {
      const result = await querySpansJson(mcpPort, {
        aggregated: false,
        search: '',
        page,
      })
      for (const span of result.spans) spanTypes.add(spanType(span))
      totalPages = result.totalPages
      totalCount = result.totalCount
      page++
    } while (page <= totalPages)

    expect(spanTypes.size).toBeGreaterThan(0)
    const baseline = {
      spanTypes: [...spanTypes].sort(),
      // A power-of-ten bucket catches substantial changes without tying the
      // snapshot to an exact count that varies between test runs.
      spanCountOrderOfMagnitude: Math.round(Math.log10(totalCount)),
    }
    if (isNextDev) {
      expect(baseline).toMatchInlineSnapshot(`
       {
         "spanCountOrderOfMagnitude": 4,
         "spanTypes": [
           "analyze ecmascript module (turbopack_ecmascript::references)",
           "app endpoint HTML (next_api::app)",
           "apply effects (turbo_tasks::effect)",
           "async reference (turbopack_core::module_graph)",
           "benchmark file I/O (next_napi_bindings::next_api::project)",
           "benchmark file IO (measurement) (next_napi_bindings::next_api::project)",
           "build client reference manifest (next_core::next_manifests::client_reference_manifest)",
           "build layout trees (next_core::app_structure)",
           "build module graph (turbopack_core::module_graph)",
           "chunking (turbopack_browser::chunking_context)",
           "chunking (turbopack_nodejs::chunking_context)",
           "client side rendering (next_core::next_app::app_client_references_chunks)",
           "code generation (turbopack_ecmascript)",
           "code generation raw module (next_core::raw_ecmascript_module)",
           "collect all asset paths (next_api::paths)",
           "collect all client references for endpoint (next_api::module_graph)",
           "collect all next/dynamic imports for endpoint (next_api::module_graph)",
           "collect all server actions for endpoint (next_api::module_graph)",
           "collect client references for endpoint (next_api::module_graph)",
           "collect next/dynamic imports for endpoint (next_api::module_graph)",
           "collect server actions for endpoint (next_api::module_graph)",
           "compute async chunks (turbopack_ecmascript::async_chunk::module)",
           "compute async module info (turbopack_core::module_graph)",
           "compute chunk group info (turbopack_core::module_graph::chunk_group_info)",
           "compute emit-collect (turbopack_core::module_graph::collect)",
           "compute module batches (turbopack_core::module_graph::module_batches)",
           "create project (next_napi_bindings::next_api::project)",
           "emit asset (next_core::emit)",
           "emitting (next_api::project)",
           "entrypoints subscription (next_napi_bindings::next_api::project)",
           "event (event)",
           "file change (turbo_tasks_fs::watcher)",
           "find server entries (next_core::next_client_reference::visit_client_reference)",
           "flattening index source map in RawEcmascriptModule (next_core::raw_ecmascript_module)",
           "generate source map (turbopack_ecmascript::parse)",
           "generating client references graphs (next_api::module_graph)",
           "generating next/dynamic graphs (next_api::module_graph)",
           "generating server actions graphs (next_api::module_graph)",
           "get server HMR update (next_napi_bindings::next_api::project)",
           "get server-side endpoint changes (next_napi_bindings::next_api::endpoint)",
           "initialize project (next_api::project)",
           "internal resolving (turbopack_core::resolve)",
           "invalidate (turbo_tasks::manager)",
           "invalidate filesystem (turbo_tasks_fs::disk)",
           "isolated reference (turbopack_core::module_graph)",
           "module (next_core::next_client_reference::visit_client_reference)",
           "module (turbopack_core::module_graph)",
           "module graph for endpoint (next_api::app)",
           "parse ecmascript (turbopack_ecmascript::parse)",
           "precompute code generation (turbopack_ecmascript)",
           "process client references (next_core::next_app::app_client_references_chunks)",
           "process module (turbopack)",
           "read app directory tree (next_core::app_structure)",
           "read directory (turbo_tasks_fs::disk)",
           "read file (turbo_tasks_fs::disk)",
           "read file before write (turbo_tasks_fs::disk)",
           "read metadata (turbo_tasks_fs::disk)",
           "read symlink (turbo_tasks_fs::disk)",
           "resolving (turbopack_core::resolve)",
           "server changes subscription (next_napi_bindings::next_api::endpoint)",
           "server hmr snapshot (next_napi_bindings::next_api::project)",
           "server side rendering (next_core::next_app::app_client_references_chunks)",
           "shared reference (turbopack_core::module_graph)",
           "subscribe to entrypoints (next_napi_bindings::next_api::project)",
           "thread (turbo_tasks::spawn)",
           "thread (turbo_tasks_backend::backend)",
           "update project (next_napi_bindings::next_api::project)",
           "update project options (next_api::project)",
           "write endpoint to disk (next_napi_bindings::next_api::endpoint)",
           "write file (turbo_tasks_fs::disk)",
         ],
       }
      `)
    } else {
      expect(baseline).toMatchInlineSnapshot(`
       {
         "spanCountOrderOfMagnitude": 4,
         "spanTypes": [
           "analyze ecmascript module (turbopack_ecmascript::references)",
           "app endpoint HTML (next_api::app)",
           "apply effects (turbo_tasks::effect)",
           "async reference (turbopack_core::module_graph)",
           "blocking (turbo_tasks::scope_bounded)",
           "build client reference manifest (next_core::next_manifests::client_reference_manifest)",
           "build layout trees (next_core::app_structure)",
           "build module graph (turbopack_core::module_graph)",
           "chunk group collection (turbopack_core::module_graph::merged_modules)",
           "chunking (turbopack_browser::chunking_context)",
           "chunking (turbopack_nodejs::chunking_context)",
           "client side rendering (next_core::next_app::app_client_references_chunks)",
           "code generation (turbopack_ecmascript)",
           "collect all client references for endpoint (next_api::module_graph)",
           "collect all next/dynamic imports for endpoint (next_api::module_graph)",
           "collect all server actions for endpoint (next_api::module_graph)",
           "collect client references for endpoint (next_api::module_graph)",
           "collect mergeable modules (turbopack_core::module_graph::merged_modules)",
           "collect next/dynamic imports for endpoint (next_api::module_graph)",
           "collect server actions for endpoint (next_api::module_graph)",
           "compute async module info (turbopack_core::module_graph)",
           "compute binding usage info (turbopack_core::module_graph::binding_usage_info)",
           "compute chunk group info (turbopack_core::module_graph::chunk_group_info)",
           "compute depth (turbopack_core::module_graph::merged_modules)",
           "compute emit-collect (turbopack_core::module_graph::collect)",
           "compute merged modules (turbopack_core::module_graph::merged_modules)",
           "compute module batches (turbopack_core::module_graph::module_batches)",
           "compute module id map (turbopack::global_module_ids)",
           "create project (next_napi_bindings::next_api::project)",
           "emit asset (next_core::emit)",
           "emit code (turbopack_ecmascript)",
           "emitting (next_api::project)",
           "exposed computation (turbopack_core::module_graph::merged_modules)",
           "fixed point traversal (turbopack_core::module_graph::merged_modules)",
           "generate merged code (turbopack_ecmascript)",
           "generate source map (turbopack_ecmascript::parse)",
           "generating client references graphs (next_api::module_graph)",
           "generating next/dynamic graphs (next_api::module_graph)",
           "generating server actions graphs (next_api::module_graph)",
           "get project feature usage (next_napi_bindings::next_api::project)",
           "initialize project (next_api::project)",
           "internal resolving (turbopack_core::resolve)",
           "invalidate filesystem (turbo_tasks_fs::disk)",
           "isolated reference (turbopack_core::module_graph)",
           "make production chunks (turbopack_core::chunk::chunking::production)",
           "map chunk groups (turbopack_core::module_graph::merged_modules)",
           "merging (turbopack_core::module_graph::merged_modules)",
           "merging chunk group lists (turbopack_core::module_graph::merged_modules)",
           "minify ecmascript code (turbopack_ecmascript::minify)",
           "module (turbopack_core::module_graph)",
           "output file tracing (next_api::nft_json)",
           "parse ecmascript (turbopack_ecmascript::parse)",
           "persist (turbo_tasks_backend::backend)",
           "pre-fetch async module status (turbopack_core::module_graph::merged_modules)",
           "precompute code generation (turbopack_ecmascript)",
           "process client references (next_core::next_app::app_client_references_chunks)",
           "process module (turbopack)",
           "read app directory tree (next_core::app_structure)",
           "read directory (turbo_tasks_fs::disk)",
           "read file (turbo_tasks_fs::disk)",
           "read file before write (turbo_tasks_fs::disk)",
           "read metadata (turbo_tasks_fs::disk)",
           "read symlink (turbo_tasks_fs::disk)",
           "reconciliation (turbopack_core::module_graph::merged_modules)",
           "resolving (turbopack_core::resolve)",
           "save snapshot (turbo_tasks_backend::kv_backing_storage)",
           "server side rendering (next_core::next_app::app_client_references_chunks)",
           "shared reference (turbopack_core::module_graph)",
           "shutdown project (next_napi_bindings::next_api::project)",
           "trace directory (turbopack_ecmascript::references::raw)",
           "trace endpoint (next_api::nft)",
           "trace file (turbopack_ecmascript::references::raw)",
           "traced reference (turbopack_core::module_graph)",
           "whole app module graph (next_api::project)",
           "write all entrypoints to disk (next_napi_bindings::next_api::project)",
           "write file (turbo_tasks_fs::disk)",
         ],
       }
      `)
    }
  }, 120_000)

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
