import execa from 'execa'
import { createInterface } from 'readline'

/**
 * How long to let the log stream settle before the suite starts making
 * requests. Elapsing is normal — see `waitForStreamReady`.
 */
const QUIET_DEPLOYMENT_HEAD_START_MS = 15_000

/** Collect application messages, never CLI diagnostics, into the test output. */
export class DeployRuntimeLogs {
  private process: execa.ExecaChildProcess<string>
  private completion: Promise<void>
  private stopping = false
  private error: Error | undefined
  private seenRows = new Set<string>()
  private markFirstMessage!: () => void
  private firstMessage = new Promise<void>((resolve) => {
    this.markFirstMessage = resolve
  })

  constructor(
    url: string,
    options: { cwd: string; env: NodeJS.ProcessEnv; flags: string[] },
    append: (message: string, stream: 'stdout' | 'stderr') => void
  ) {
    this.process = execa(
      'vercel',
      ['logs', url, '--follow', '--json', ...options.flags],
      { cwd: options.cwd, env: options.env, buffer: false }
    )
    // Execa 2 also waits for its combined output stream to end. Drain it even
    // though messages are read from stdout, or shutdown can hang after exit.
    this.process.all?.resume()
    const lines = createInterface({ input: this.process.stdout! })
    lines.on('line', (line) => {
      if (this.stopping || this.error || !line.trim()) return
      try {
        const event = JSON.parse(line)
        if (typeof event.message !== 'string') {
          throw new Error('Runtime log record is missing its message')
        }
        if (event.source === 'delimiter' || event.messageTruncated) {
          throw new Error('Vercel runtime logs were limited or truncated')
        }
        // The CLI can reconnect its stream. Only discard re-delivery of an
        // identified record, never repeated text from distinct invocations.
        if (typeof event.rowId === 'string' && event.rowId) {
          const key = JSON.stringify([
            event.rowId,
            event.source,
            event.level,
            event.message,
          ])
          if (this.seenRows.has(key)) return
          this.seenRows.add(key)
        }
        const message = event.message.endsWith('\n')
          ? event.message
          : `${event.message}\n`
        // Severity is the available approximation of stdout/stderr; the remote
        // record does not preserve the application's original file descriptor.
        const isErrorStream = ['warning', 'warn', 'error', 'fatal'].includes(
          event.level
        )
        append(message, isErrorStream ? 'stderr' : 'stdout')
        this.markFirstMessage()
      } catch {
        // Do not include raw records: they may contain application secrets.
        this.error = new Error('Failed to read complete Vercel runtime logs')
        this.process.kill()
      }
    })
    // Keep CLI diagnostics out of cliOutput, where they could satisfy an
    // assertion intended to match application output.
    this.process.stderr?.resume()
    this.completion = this.process
      .then(
        () => {
          if (!this.stopping) {
            this.error ??= new Error(
              'Vercel runtime log stream ended unexpectedly'
            )
          }
        },
        () => {
          if (!this.stopping) {
            this.error ??= new Error('Vercel runtime log collection failed')
          }
        }
      )
      .finally(() => lines.close())
  }

  assertHealthy() {
    if (this.error) throw this.error
  }

  /**
   * Give the stream a head start before the suite makes its first request, so
   * an application that logs immediately is not missed.
   *
   * A deployment that has just been created is silent: it emits nothing until
   * a request arrives, and the requests come from the test bodies, which run
   * after setup. Waiting for a record is therefore best-effort and a quiet
   * window is the expected outcome, not a failure — tests that assert on logs
   * poll with `retry()`. Only a collector that has actually broken rejects.
   */
  async waitForStreamReady() {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.firstMessage,
        this.completion,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, QUIET_DEPLOYMENT_HEAD_START_MS)
        }),
      ])
      this.assertHealthy()
    } finally {
      clearTimeout(timer)
    }
  }

  async stop() {
    // Observe an already-settled collector failure before marking its shutdown
    // intentional. Otherwise a failed command followed immediately by teardown
    // could be mistaken for a successful cancellation.
    await Promise.resolve()
    this.stopping = true
    this.process.kill('SIGTERM', { forceKillAfterTimeout: 1000 })
    await this.completion
    this.assertHealthy()
  }
}
