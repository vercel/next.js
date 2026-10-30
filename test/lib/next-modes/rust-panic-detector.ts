import stripAnsi from 'strip-ansi'

/**
 * Lines that indicate a Rust panic or a fatal Turbopack internal error in the
 * output of a Next.js process.
 *
 * - Rust's default panic hook prints `thread '<name>' panicked at <location>:`
 *   or `thread panicked at <location>:` (newer toolchains can also include
 *   the thread id: `thread '<name>' (1234) panicked at`). The Next.js napi
 *   bindings chain to the default hook, so this is printed even when
 *   turbo-tasks catches the panic.
 * - `log_internal_error_and_inform` in `crates/next-napi-bindings` prints
 *   `FATAL: An unexpected Turbopack error occurred` for internal errors.
 */
const RUST_PANIC_PATTERNS: RegExp[] = [
  /thread(?: '[^'\n]*')?(?: \(\d+\))? panicked at /,
  /FATAL: An unexpected Turbopack error occurred/,
]

/** Lines of output captured after a match, to give the report context. */
const CONTEXT_LINES = 20
/** Matches beyond this are counted but not printed in the report. */
const MAX_REPORTED_MATCHES = 10

type Stream = 'stdout' | 'stderr'

interface Match {
  stream: Stream
  lines: string[]
}

export class RustPanicError extends Error {
  name = 'RustPanicError'
}

/**
 * Scans the stdout/stderr of a Next.js child process for Rust panics. Output
 * arrives in arbitrary chunks, so lines are buffered per stream and only
 * complete lines are matched.
 */
export class RustPanicDetector {
  private partialLines: Record<Stream, string> = { stdout: '', stderr: '' }
  private matches: Match[] = []
  private matchCount = 0
  /** The match still collecting context lines, per stream. */
  private collecting: Partial<
    Record<Stream, { match: Match; remaining: number }>
  > = {}

  public write(stream: Stream, chunk: string): void {
    const lines = (this.partialLines[stream] + chunk).split('\n')
    this.partialLines[stream] = lines.pop()!
    for (const line of lines) {
      this.processLine(stream, line)
    }
  }

  /** Process any buffered partial lines, e.g. once the process exited. */
  public flush(): void {
    for (const stream of ['stdout', 'stderr'] as const) {
      if (this.partialLines[stream]) {
        this.processLine(stream, this.partialLines[stream])
        this.partialLines[stream] = ''
      }
    }
  }

  /**
   * Return a report of all matches seen since the last call, or `null` if
   * there were none. Reported matches are cleared so they are only reported
   * once.
   */
  public takeReport(): string | null {
    if (this.matchCount === 0) {
      return null
    }
    const sections = this.matches.map(
      (match) => `[${match.stream}]\n${match.lines.join('\n')}`
    )
    const omitted = this.matchCount - this.matches.length
    if (omitted > 0) {
      sections.push(`... and ${omitted} more`)
    }
    this.matches = []
    this.matchCount = 0
    this.collecting = {}
    return sections.join('\n\n')
  }

  private processLine(stream: Stream, rawLine: string): void {
    const line = stripAnsi(rawLine).replace(/\r$/, '')
    if (RUST_PANIC_PATTERNS.some((pattern) => pattern.test(line))) {
      this.matchCount++
      if (this.matches.length < MAX_REPORTED_MATCHES) {
        const match: Match = { stream, lines: [line] }
        this.matches.push(match)
        this.collecting[stream] = { match, remaining: CONTEXT_LINES }
      } else {
        delete this.collecting[stream]
      }
      return
    }
    const collecting = this.collecting[stream]
    if (collecting) {
      collecting.match.lines.push(line)
      if (--collecting.remaining === 0) {
        delete this.collecting[stream]
      }
    }
  }
}
