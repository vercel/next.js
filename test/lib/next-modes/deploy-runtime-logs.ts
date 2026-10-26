import execa from 'execa'

const RETRY_INTERVAL_MS = 2_000
// One Observability API page. Larger limits make the CLI page by cursor, which
// can repeat or skip entries that share a timestamp at a page boundary.
const ENTRY_LIMIT = 1_000
const QUERY_TIMEOUT_MS = 30_000
const MAX_QUERY_ATTEMPTS = 3

function describeQueryFailure(error: unknown) {
  const failure = error as Partial<execa.ExecaError> | null
  // Never include the command, output, or error message: they can contain
  // application data or the CLI's authentication arguments.
  if (failure?.timedOut) return `timed out after ${QUERY_TIMEOUT_MS}ms`
  if (typeof failure?.exitCode === 'number') {
    return `CLI exit code ${failure.exitCode}`
  }
  return 'CLI could not complete the query'
}

type RuntimeLogEntry = {
  requestId: string
  level: string
  stream: 'stdout' | 'stderr'
  message: string
}

type CliLine = {
  type?: unknown
  reason?: unknown
  data?: {
    requestId?: unknown
    level?: unknown
    stream?: unknown
    message?: unknown
    truncated?: unknown
    isSystemLog?: unknown
  } | null
  pagination?: { hasMore?: unknown } | null
  excludedIntervals?: unknown
} | null

const STDERR_LEVELS = ['warning', 'warn', 'error', 'fatal']

function incomplete(reason: string): never {
  throw new Error(`Failed to read complete Vercel runtime logs (${reason})`)
}

/**
 * Parse `vercel logs --json` (Vercel CLI 64+): one `log` line per runtime log
 * entry, newest first, then a `summary` line. Returns the application entries
 * oldest first. The reason in an error never includes log contents.
 */
function parseVercelLogs(output: string): RuntimeLogEntry[] {
  const entries: RuntimeLogEntry[] = []
  let summary: CliLine | undefined
  for (const line of output.split('\n')) {
    if (!line.trim()) continue
    let record: CliLine
    try {
      record = JSON.parse(line)
    } catch {
      incomplete('invalid JSON line')
    }
    if (summary) incomplete('output after the summary')

    if (record?.type === 'summary') {
      summary = record
    } else if (record?.type === 'warning') {
      // Warnings report results the query could not return, such as a gap in
      // the time window.
      const reason =
        typeof record.reason === 'string' && /^[a-z_]+$/.test(record.reason)
          ? record.reason
          : 'unknown'
      incomplete(`CLI warning: ${reason}`)
    } else if (record?.type === 'log') {
      const data = record.data
      if (!data || typeof data.message !== 'string') {
        incomplete('invalid log entry')
      }
      // Never silently accept a partial message.
      if (data.truncated === true) incomplete('truncated log entry')
      // Platform messages are not part of the application output.
      if (data.isSystemLog === true) continue
      const level = typeof data.level === 'string' ? data.level : 'info'
      const stream =
        data.stream === 'stdout' || data.stream === 'stderr'
          ? data.stream
          : STDERR_LEVELS.includes(level)
            ? 'stderr'
            : 'stdout'
      entries.push({
        // Entries outside a request, such as function initialization, share
        // one group.
        requestId: typeof data.requestId === 'string' ? data.requestId : '',
        level,
        stream,
        message: data.message,
      })
    } else {
      incomplete('unexpected record type')
    }
  }

  if (!summary) incomplete('missing summary')
  // Never silently accept an incomplete query window.
  if (summary.pagination?.hasMore !== false) {
    incomplete(`more than ${ENTRY_LIMIT} entries`)
  }
  if (
    Array.isArray(summary.excludedIntervals) &&
    summary.excludedIntervals.length > 0
  ) {
    incomplete('incomplete time range')
  }
  return entries.reverse()
}

/** Collect application messages, never CLI diagnostics, into the test output. */
export class DeployRuntimeLogs {
  private stopped = false
  private refreshing = false
  private error: Error | undefined
  private readonly since = new Date().toISOString()
  private readonly seen = new Map<string, Map<string, number>>()

  constructor(
    private readonly url: string,
    private readonly options: {
      cwd: string
      env: NodeJS.ProcessEnv
      flags: string[]
    },
    private readonly append: (
      message: string,
      stream: 'stdout' | 'stderr'
    ) => void
  ) {}

  private query() {
    for (let attempt = 1; ; attempt++) {
      // Query the stored runtime logs of this deployment rather than a live
      // stream, which can omit messages. Keep the original lower bound: entries
      // can arrive late.
      try {
        const result = execa.sync(
          'vercel',
          [
            'logs',
            '--deployment',
            this.url,
            '--json',
            '--since',
            this.since,
            '--limit',
            String(ENTRY_LIMIT),
            ...this.options.flags,
          ],
          {
            cwd: this.options.cwd,
            env: this.options.env,
            timeout: QUERY_TIMEOUT_MS,
            killSignal: 'SIGKILL',
          }
        )
        return result.stdout
      } catch (error) {
        const failure = new Error(
          `Vercel runtime log collection failed (attempt ${attempt}/${MAX_QUERY_ATTEMPTS}: ${describeQueryFailure(error)})`
        )
        if (attempt === MAX_QUERY_ATTEMPTS) throw failure

        // A single failed API query must not disable collection for the rest
        // of a suite. Retry the same window; only a complete successful query
        // is delivered, so partial output cannot cause duplicates or gaps.
        const delay = RETRY_INTERVAL_MS * 2 ** (attempt - 1)
        console.warn(`${failure.message}; retrying in ${delay}ms`)
        // The getter must wait for retries too; an asynchronous timer would
        // return the previous output before this refresh had finished.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay)
      }
    }
  }

  /** Fetch and append newly indexed messages before cliOutput returns. */
  refresh() {
    this.assertHealthy()
    // stdout/stderr listeners can read cliOutput while append() emits an event.
    // Return the output being delivered rather than recursively querying logs.
    if (this.stopped || this.refreshing) return
    this.refreshing = true
    try {
      this.appendOutput(parseVercelLogs(this.query()))
    } catch (error) {
      this.error = error as Error
      throw error
    } finally {
      this.refreshing = false
    }
  }

  private appendOutput(entries: RuntimeLogEntry[]) {
    try {
      // Count occurrences per request: repeated text is legitimate, and late
      // entries may be inserted before entries already observed.
      const occurrences = new Map<string, Map<string, number>>()
      for (const entry of entries) {
        let previous = this.seen.get(entry.requestId)
        if (!previous) {
          previous = new Map()
          this.seen.set(entry.requestId, previous)
        }
        let counts = occurrences.get(entry.requestId)
        if (!counts) {
          counts = new Map()
          occurrences.set(entry.requestId, counts)
        }
        const key = JSON.stringify([entry.level, entry.stream, entry.message])
        const count = (counts.get(key) ?? 0) + 1
        counts.set(key, count)
        if (count <= (previous.get(key) ?? 0)) continue
        previous.set(key, count)

        const message = entry.message.endsWith('\n')
          ? entry.message
          : `${entry.message}\n`
        this.append(message, entry.stream)
      }
    } catch {
      throw new Error('Failed to deliver Vercel runtime logs')
    }
  }

  assertHealthy() {
    if (this.error) throw this.error
  }

  stop() {
    this.stopped = true
    this.assertHealthy()
  }
}
