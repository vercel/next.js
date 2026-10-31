import path from 'path'
import spawn from 'cross-spawn'
import type { ChildProcess } from 'child_process'
import treeKill from 'tree-kill'
import { findPort, retry } from 'next-test-utils'

const nextBin = path.join(
  path.dirname(require.resolve('next/package')),
  'dist/bin/next'
)

/** Name prefix of the span `turbo_tasks` emits for every task execution. */
const TASK_SPAN_PREFIX = 'turbo_tasks::function'

/**
 * The trace server returns at most this many levels of nested spans per query,
 * so the subtrees below the deepest returned spans are queried separately.
 */
const MAX_QUERY_DEPTH = 32

/**
 * The trace server erases its progress line and prints a final line once it has
 * read the whole trace file. Until then, queries see a partial trace.
 */
function isTraceReadComplete(output: string): boolean {
  const ERASE_LINE = '\x1b[2K'
  return output
    .split(ERASE_LINE)
    .some(
      (line) =>
        line.includes('\n') &&
        (line.startsWith('Initial read completed') || /^\d+ spans/.test(line))
    )
}
const MCP_SERVER_READY = 'Alternatively, connect an MCP client'

interface SpanData {
  id: string
  name: string
  args: [string, string][]
  children: SpanData[]
}

interface QuerySpansResult {
  spans: SpanData[]
  page: number
  totalPages: number
}

export interface TaskExecution {
  /** The turbo-tasks function name, e.g. `DiskFileSystem::new_internal`. */
  name: string
  /** Why the task was executed, e.g. `activate_initial`, `invalidated`. */
  reason: string | undefined
}

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
 * Query the raw (not aggregated) spans below `parent`, each with
 * `MAX_QUERY_DEPTH - 1` levels of descendants nested in `children`.
 */
async function querySubtrees(
  port: number,
  parent: string | undefined
): Promise<SpanData[]> {
  const spans: SpanData[] = []
  for (let page = 1; ; page++) {
    const result: QuerySpansResult = JSON.parse(
      await callMcpTool(port, 'query_spans', {
        parent,
        aggregated: false,
        depth: MAX_QUERY_DEPTH,
        page,
        pageSize: 500,
        outputType: 'json',
      })
    )
    spans.push(...result.spans)
    if (page >= result.totalPages) return spans
  }
}

/**
 * Collect every turbo-tasks function execution recorded in a trace captured
 * with `NEXT_TURBOPACK_TRACING=turbo-tasks`, by serving it with
 * `next internal trace` and querying its MCP endpoint.
 */
export async function readTaskExecutions(
  traceFile: string
): Promise<TaskExecution[]> {
  const wsPort = await findPort()
  const mcpPort = await findPort()
  const server: ChildProcess = spawn(
    'node',
    [
      '--no-deprecation',
      nextBin,
      'internal',
      'trace',
      traceFile,
      '--port',
      String(wsPort),
      '--mcp-port',
      String(mcpPort),
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  )
  let output = ''
  server.stdout!.setEncoding('utf8')
  server.stdout!.on('data', (chunk: string) => {
    output += chunk
  })
  try {
    await retry(
      () => {
        if (
          !isTraceReadComplete(output) ||
          !output.includes(MCP_SERVER_READY)
        ) {
          throw new Error(`Trace server is not ready yet:\n${output}`)
        }
      },
      120_000,
      200
    )

    // Walk the whole span tree, `MAX_QUERY_DEPTH` levels per query.
    const executions: TaskExecution[] = []
    const parents: (string | undefined)[] = [undefined]
    const visit = (span: SpanData, level: number) => {
      if (span.name.startsWith(TASK_SPAN_PREFIX)) {
        const args = new Map(span.args)
        executions.push({
          name: args.get('name') ?? span.name,
          reason: args.get('reason'),
        })
      }
      if (level === MAX_QUERY_DEPTH) {
        // The children of this span were not included in the response.
        parents.push(span.id)
      }
      for (const child of span.children) visit(child, level + 1)
    }
    while (parents.length > 0) {
      const parent = parents.shift()
      for (const span of await querySubtrees(mcpPort, parent)) visit(span, 1)
    }
    return executions
  } finally {
    await new Promise<void>((resolve) => {
      if (server.pid === undefined) return resolve()
      treeKill(server.pid, 'SIGKILL', () => resolve())
    })
  }
}

/** Sorted, de-duplicated names of the executed turbo-tasks functions. */
export function executedFunctionNames(executions: TaskExecution[]): string[] {
  return [...new Set(executions.map((e) => e.name))].sort()
}
