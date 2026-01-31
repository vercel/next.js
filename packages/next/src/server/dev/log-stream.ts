/**
 * Structured logging for Next.js dev mode.
 * Ring buffer for bounded memory, optional file sink for MCP.
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

export class FileSink implements LogSink {
  private fs: typeof import('fs')
  private path: typeof import('path')
  private logFilePath: string
  private pending: string[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private flushDelayMs: number

  constructor(logFilePath: string, flushDelayMs = 100) {
    this.fs = require('fs') as typeof import('fs')
    this.path = require('path') as typeof import('path')

    this.logFilePath = logFilePath
    this.flushDelayMs = flushDelayMs

    this.ensureFile()
  }

  /** Create the log directory and file if they don't exist */
  private ensureFile(): void {
    this.fs.mkdirSync(this.path.dirname(this.logFilePath), { recursive: true })
    this.fs.writeFileSync(this.logFilePath, '')
  }

  /** Map LogLevel back to a display method name matching the old FileLogger format */
  private static levelToFileMethod(level: LogLevel): string {
    return level === 'info' ? 'LOG' : level.toUpperCase()
  }

  write(event: LogEvent): void {
    // Only log console messages, not request events
    if (event.scope === 'request') return

    // Format timestamp as HH:MM:SS.mmm (matching old FileLogger)
    const d = new Date(event.ts)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    const ms = String(d.getMilliseconds()).padStart(3, '0')
    const timestamp = `${hh}:${mm}:${ss}.${ms}`

    const source = event.source === 'browser' ? 'Browser' : 'Server'

    // Level: use console method name if available, else map from level
    const method =
      (event.scope === 'console' &&
        (event.structured?.method as string | undefined)) ||
      FileSink.levelToFileMethod(event.level)
    const level = method.toUpperCase()

    this.pending.push(
      JSON.stringify({ timestamp, source, level, message: event.message }) +
        '\n'
    )
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.timer) return // Already scheduled
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, this.flushDelayMs)
  }

  private flush(): void {
    if (this.pending.length === 0) return
    try {
      this.fs.appendFileSync(this.logFilePath, this.pending.join(''))
      this.pending = []
    } catch (err: any) {
      // Directory may have been removed by bundler (e.g. webpack cleans distDir).
      // Recreate it and retry once.
      if (err?.code === 'ENOENT') {
        try {
          this.ensureFile()
          this.fs.appendFileSync(this.logFilePath, this.pending.join(''))
          this.pending = []
        } catch {
          // Give up silently
        }
      }
    }
  }

  close(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.flush()
  }
}

export class TuiSink implements LogSink {
  write(event: LogEvent): void {
    if (!process.send) return

    // Forward console logs from userland or browser
    if (
      event.scope === 'console' &&
      (event.source === 'userland' || event.source === 'browser')
    ) {
      process.send({
        tuiMessage: {
          type: 'structured-log',
          payload: {
            ...event.structured,
            type: 'console',
            level: event.level,
            method:
              (event.structured?.method as string | undefined) || event.level,
            message: event.message,
            source: event.source,
          },
        },
      })
      return
    }

    // Forward request logs with structured data (includes fetch metrics)
    if (event.scope === 'request' && event.structured) {
      process.send({
        tuiMessage: {
          type: 'structured-log',
          payload: event.structured,
        },
      })
    }
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

  debug(msg: string, opts?: LogOpts): void {
    this.emit('debug', msg, opts)
  }

  info(msg: string, opts?: LogOpts): void {
    this.emit('info', msg, opts)
  }

  warn(msg: string, opts?: LogOpts): void {
    this.emit('warn', msg, opts)
  }

  error(msg: string, opts?: LogOpts): void {
    this.emit('error', msg, opts)
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

  /** Get logs since timestamp */
  since(timestamp: number, limit?: number): LogEvent[] {
    const all = this.recent(this.len)
    const filtered = all.filter((e) => e.ts >= timestamp)
    return limit ? filtered.slice(-limit) : filtered
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
