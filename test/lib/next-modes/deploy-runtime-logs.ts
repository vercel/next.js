import execa from 'execa'

const POLL_INTERVAL_MS = 2_000
const REQUEST_LIMIT = 1_000

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

  private async poll() {
    let output: string
    try {
      // Live streams can omit messages present in the stored request logs and
      // expire after five minutes. Query complete request logs instead. Keep
      // the original lower bound: records can arrive late or gain more logs.
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
          timeout: 30_000,
        }
      )
      output = result.stdout
    } catch {
      // CLI errors can include application data or credentials.
      this.error = new Error('Vercel runtime log collection failed')
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
    // Let the bounded query finish rather than killing the CLI wrapper and
    // leaving its native subprocess holding the output pipes open.
    await this.pending
    this.assertHealthy()
  }
}
