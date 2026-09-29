import execa from 'execa'

const POLL_INTERVAL_MS = 2_000
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
  private pending: Promise<void>
  private timer: ReturnType<typeof setTimeout> | undefined
  private resumeRetry: (() => void) | undefined
  private stopping = false
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
  ) {
    this.pending = this.poll()
  }

  private async query() {
    for (let attempt = 1; ; attempt++) {
      // Live streams can omit messages present in the stored request logs and
      // expire after five minutes. Query complete request logs instead. Keep
      // the original lower bound: records can arrive late or gain more logs.
      try {
        const result = await execa(
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
          }
        )
        return result.stdout
      } catch (error) {
        const failure = new Error(
          `Vercel runtime log collection failed (attempt ${attempt}/${MAX_QUERY_ATTEMPTS}: ${describeQueryFailure(error)})`
        )
        if (this.stopping || attempt === MAX_QUERY_ATTEMPTS) throw failure

        // A single failed API query must not disable collection for the rest
        // of a suite. Retry the same window; only a complete successful query
        // is delivered, so partial output cannot cause duplicates or gaps.
        const delay = POLL_INTERVAL_MS * 2 ** (attempt - 1)
        console.warn(`${failure.message}; retrying in ${delay}ms`)
        await new Promise<void>((resolve) => {
          this.resumeRetry = resolve
          this.timer = setTimeout(resolve, delay)
        })
        this.resumeRetry = undefined
        if (this.stopping) throw failure
      }
    }
  }

  private async poll() {
    let output: string
    try {
      output = await this.query()
    } catch (error) {
      this.error = error
      return
    }
    if (this.stopping) return

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
      this.error = new Error('Failed to read complete Vercel runtime logs')
      return
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
      this.error = new Error('Failed to deliver Vercel runtime logs')
      return
    }

    this.timer = setTimeout(() => {
      this.pending = this.poll()
    }, POLL_INTERVAL_MS)
  }

  assertHealthy() {
    if (this.error) throw this.error
  }

  /** Confirm access to request logs before the suite sends any requests. */
  async waitForReady() {
    await this.pending
    this.assertHealthy()
  }

  async stop() {
    this.stopping = true
    clearTimeout(this.timer)
    this.resumeRetry?.()
    // Let the bounded query finish rather than killing the CLI wrapper and
    // leaving its native subprocess holding the output pipes open.
    await this.pending
    this.assertHealthy()
  }
}
