import execa from 'execa'

const RETRY_INTERVAL_MS = 2_000
const REQUEST_LIMIT = 1_000
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

type Log = { message: string; level?: string; messageTruncated?: boolean }
type RequestLogs = {
  id: string
  logs: Log[]
  messageTruncated?: boolean
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
      // Live streams can omit messages present in the stored request logs and
      // expire after five minutes. Query complete request logs instead. Keep
      // the original lower bound: records can arrive late or gain more logs.
      try {
        const result = execa.sync(
          'vercel',
          [
            'logs',
            this.url,
            '--json',
            '--since',
            this.since,
            '--limit',
            String(REQUEST_LIMIT),
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
      this.appendOutput(this.query())
    } catch (error) {
      this.error = error as Error
      throw error
    } finally {
      this.refreshing = false
    }
  }

  private appendOutput(output: string) {
    let requests: RequestLogs[]
    try {
      requests = output
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line))
      // Never silently accept an incomplete query window.
      if (requests.length >= REQUEST_LIMIT) {
        throw new Error('Runtime log request limit reached')
      }
      for (const request of requests) {
        if (
          !request ||
          typeof request.id !== 'string' ||
          !request.id ||
          request.messageTruncated ||
          !Array.isArray(request.logs) ||
          request.logs.some(
            (log) =>
              !log || typeof log.message !== 'string' || log.messageTruncated
          )
        ) {
          throw new Error('Invalid or truncated runtime log record')
        }
      }
    } catch {
      throw new Error('Failed to read complete Vercel runtime logs')
    }

    try {
      // The top-level message summarizes a request. Only `logs` contains the
      // individual application messages, including errors and hook output.
      for (const request of requests.reverse()) {
        let previous = this.seen.get(request.id)
        if (!previous) {
          previous = new Map()
          this.seen.set(request.id, previous)
        }
        const occurrences = new Map<string, number>()
        for (const log of request.logs) {
          const key = JSON.stringify([log.level, log.message])
          const count = (occurrences.get(key) ?? 0) + 1
          occurrences.set(key, count)
          if (count <= (previous.get(key) ?? 0)) continue
          previous.set(key, count)

          // Count occurrences per request: repeated text is legitimate, and
          // late log entries may be inserted before entries already observed.
          const message = log.message.endsWith('\n')
            ? log.message
            : `${log.message}\n`
          const isErrorStream = ['warning', 'warn', 'error', 'fatal'].includes(
            log.level ?? ''
          )
          this.append(message, isErrorStream ? 'stderr' : 'stdout')
        }
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
