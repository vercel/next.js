/**
 * Structured logging for Next.js dev mode.
 * In-memory ring buffer for bounded memory, queryable via MCP.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogSource = 'system' | 'userland' | 'browser'

export interface LogEvent {
  ts: number
  level: LogLevel
  source: LogSource
  scope?: string
  message: string
  structured?: Record<string, unknown>
}

export interface LogSink {
  write(event: LogEvent): void
  close?(): void
}

/** Convert console method name to LogLevel */
export function methodToLevel(method: string): LogLevel {
  switch (method.toLowerCase()) {
    case 'error':
    case 'assert':
      return 'error'
    case 'warn':
      return 'warn'
    case 'debug':
      return 'debug'
    default:
      return 'info'
  }
}

type LogOpts = {
  source?: LogSource
  scope?: string
  structured?: Record<string, unknown>
}

export class LogStream {
  private buf: LogEvent[]
  private idx = 0
  private len = 0
  private readonly cap: number
  private sinks: LogSink[] = []

  constructor(capacity = 1000) {
    this.cap = capacity
    this.buf = new Array(capacity)
  }

  emit(level: LogLevel, message: string, opts?: LogOpts): void {
    const event: LogEvent = {
      ts: Date.now(),
      level,
      source: opts?.source ?? 'system',
      scope: opts?.scope,
      message,
      structured: opts?.structured,
    }

    this.buf[this.idx] = event
    this.idx = (this.idx + 1) % this.cap
    if (this.len < this.cap) this.len++

    for (const sink of this.sinks) {
      try {
        sink.write(event)
      } catch {
        /* ignore sink errors */
      }
    }
  }

  addSink(sink: LogSink): void {
    this.sinks.push(sink)
  }

  /** Get the most recent n logs */
  recent(n = 100): LogEvent[] {
    const count = Math.min(n, this.len)
    if (count === 0) return []

    const result = new Array<LogEvent>(count)
    let ri =
      this.len < this.cap
        ? Math.max(0, this.len - count)
        : (this.idx - count + this.cap) % this.cap

    for (let i = 0; i < count; i++) {
      result[i] = this.buf[ri]
      ri = (ri + 1) % this.cap
    }
    return result
  }

  /** Get all buffered logs */
  all(): LogEvent[] {
    return this.recent(this.len)
  }

  /** Get logs since timestamp */
  since(timestamp: number): LogEvent[] {
    return this.all().filter((e) => e.ts >= timestamp)
  }

  stats(): { count: number; capacity: number } {
    return { count: this.len, capacity: this.cap }
  }

  close(): void {
    for (const sink of this.sinks) sink.close?.()
    this.sinks = []
    this.idx = 0
    this.len = 0
  }
}

let instance: LogStream | null = null

export function getLogStream(): LogStream {
  return (instance ??= new LogStream())
}

export function initLogStream(capacity?: number): LogStream {
  instance?.close()
  return (instance = new LogStream(capacity))
}
