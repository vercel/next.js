import execa from 'execa'
import { createInterface } from 'readline'

/** Collect application messages, never CLI diagnostics, into the test output. */
export class DeployRuntimeLogs {
  private process: execa.ExecaChildProcess<string>
  private completion: Promise<void>
  private stopping = false
  private error: Error | undefined
  private seenRows = new Set<string>()

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
