import { traceGlobals, traceId } from '../shared'
import fs from 'fs'
import path from 'path'
import { PHASE_DEVELOPMENT_SERVER } from '../../shared/lib/constants'
import type { TraceEvent } from '../types'
import type { Reporter } from './types'

// The webpack/rspack profiling plugins open a span per module, so writing
// events individually would put a syscall in the middle of every module build.
const BUFFER_SIZE = 16 * 1024
// Each flush is wrapped as a JSON array; the tail of the buffer is reserved
// for this and never used by event data.
const TERMINATOR = Buffer.from(']\n', 'utf8')
const MAX_UTF8_CHAR_BYTES = 4

/**
 * An append-only newline-delimited JSON file.
 *
 * There is deliberately no close: `writeSync` hands the bytes to the OS before
 * it returns, so once flushed they survive `process.exit()` and crashes that
 * run no shutdown path. Only the unflushed tail is at risk, which is why
 * `flush()` is called wherever traces need to be on disk.
 */
class RotatingWriteStream {
  readonly file: string
  private fd: number
  private readonly buffer = Buffer.allocUnsafe(BUFFER_SIZE)
  // Bytes of event data in `buffer`, excluding the terminator written at
  // flush time. 0 means nothing is pending.
  private buffered: number = 0
  private size: number = 0
  private readonly sizeLimit: number

  constructor(file: string, sizeLimit: number) {
    this.file = file
    this.sizeLimit = sizeLimit
    // TODO: opening a file in append mode like we do in dev should seed the
    // size from the current file size.
    this.size = 0

    // In dev, append so traces accumulate across sessions. In production,
    // truncate so each build starts with a fresh trace file.
    this.fd = fs.openSync(
      file,
      traceGlobals.get('phase') === PHASE_DEVELOPMENT_SERVER ? 'a' : 'w'
    )
  }
  // Recreate the file
  private rotate() {
    fs.closeSync(this.fd)
    // Opening in 'w' mode truncates the file
    this.fd = fs.openSync(this.file, 'w')
    this.size = 0
  }
  /**
   * Append one already-encoded event. Events are written as a single JSON
   * array per flush, which is the format readers expect (see
   * `parseTraceEvents` and the trace uploader).
   */
  write(encodedEvent: string): void {
    const capacity = this.buffer.length - TERMINATOR.length
    if (this.tryWrite(encodedEvent, capacity)) {
      return
    }

    // Didn't fit. Start a fresh batch and try again.
    this.flush()
    if (this.tryWrite(encodedEvent, capacity)) {
      return
    }

    // Too large to ever fit in the buffer, so give it a batch of its own.
    this.writeToFile(Buffer.from(`[${encodedEvent}]\n`, 'utf8'))
  }

  /**
   * Append `[event` or `,event` to the buffer, returning false without
   * modifying it if the whole thing does not fit.
   */
  private tryWrite(encodedEvent: string, capacity: number): boolean {
    // `[` opens a new batch, `,` separates events within one.
    const prefix = this.buffered === 0 ? '[' : ','
    const written = this.buffer.write(
      prefix + encodedEvent,
      this.buffered,
      capacity - this.buffered,
      'utf8'
    )
    // `Buffer.write` truncates silently, so the byte count is the only signal
    // that the event did not fit -- and because it stops at the last whole
    // character, a truncated write can still leave a few bytes unused. Only a
    // write that ends clear of that margin is known to be complete.
    if (this.buffered + written > capacity - MAX_UTF8_CHAR_BYTES) {
      return false
    }
    this.buffered += written
    return true
  }

  flush(): void {
    if (this.buffered === 0) {
      return
    }
    this.buffered += TERMINATOR.copy(this.buffer, this.buffered)
    const data = this.buffer.subarray(0, this.buffered)
    this.buffered = 0
    this.writeToFile(data)
  }

  private writeToFile(data: Buffer): void {
    if (this.size + data.length > this.sizeLimit) {
      this.rotate()
    }
    const fd = this.fd
    let offset = 0
    try {
      // writeSync can write fewer than all the bytes
      while (offset < data.length) {
        offset += fs.writeSync(fd, data, offset)
      }
    } catch (err) {
      // Tracing is diagnostic, so a failed write should not fail the build.
      console.log(err)
    }
    this.size += offset
  }
}

export function createJsonReporter(options: {
  filename: string
  sizeLimit: number | ((phase: string) => number)
  filter?: (event: TraceEvent) => boolean
}): Reporter {
  let writeStream: RotatingWriteStream | undefined

  function report(event: TraceEvent) {
    if (options.filter && !options.filter(event)) {
      return
    }

    const distDir = traceGlobals.get('distDir')
    const phase = traceGlobals.get('phase')
    if (!distDir || !phase) {
      return
    }

    if (!writeStream) {
      fs.mkdirSync(distDir, { recursive: true })
      const file = path.join(distDir, options.filename)
      const limit =
        typeof options.sizeLimit === 'function'
          ? options.sizeLimit(phase)
          : options.sizeLimit
      writeStream = new RotatingWriteStream(file, limit)
    }

    writeStream.write(JSON.stringify({ ...event, traceId }))
  }

  return {
    flushAll: () => writeStream?.flush(),
    report,
  }
}

export default createJsonReporter({
  filename: 'trace',
  sizeLimit: (phase) =>
    // Development is limited to 50MB, production is unlimited
    phase === PHASE_DEVELOPMENT_SERVER ? 52428800 : Infinity,
})
