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
 * Closing is not part of the normal lifetime: `writeSync` hands the bytes to
 * the OS before it returns, so once flushed they survive `process.exit()` and
 * crashes that run no shutdown path. Only the unflushed tail is at risk, which
 * is why `flush()` is called wherever traces need to be on disk. `close()`
 * exists for callers that must then act on the file itself.
 */
class RotatingWriteStream {
  readonly file: string
  // Undefined until the first write; see `open()`.
  private fd: number | undefined
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
  }

  /**
   * Open on first write rather than up front. The dev server records spans
   * before it cleans its dist dir, and a descriptor opened that early would be
   * unlinked by the clean -- writes to the orphaned inode still succeed, so
   * the trace would silently never appear on disk.
   */
  private open(): number {
    if (this.fd === undefined) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      // In dev, append so traces accumulate across sessions. In production,
      // truncate so each build starts with a fresh trace file.
      this.fd = fs.openSync(
        this.file,
        traceGlobals.get('phase') === PHASE_DEVELOPMENT_SERVER ? 'a' : 'w'
      )
    }
    return this.fd
  }

  // Recreate the file
  private rotate() {
    this.closeFd()
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    // Opening in 'w' mode truncates the file, discarding what rotated out.
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
    if (this.tryWriteToBuffer(encodedEvent, capacity)) {
      return
    }

    // Didn't fit. Start a fresh batch and try again.
    this.flush()
    if (this.tryWriteToBuffer(encodedEvent, capacity)) {
      return
    }

    // Too large to ever fit in the buffer, so give it a batch of its own.
    this.writeToFile(Buffer.from(`[${encodedEvent}]\n`, 'utf8'))
  }

  /**
   * Append `[event` or `,event` to the buffer, returning false without
   * modifying it if the whole thing does not fit.
   */
  private tryWriteToBuffer(encodedEvent: string, capacity: number): boolean {
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
    let offset = 0
    try {
      if (this.size + data.length > this.sizeLimit) {
        this.rotate()
      }
      const fd = this.open()
      // writeSync can write fewer than all the bytes
      while (offset < data.length) {
        offset += fs.writeSync(fd, data, offset)
      }
    } catch (err) {
      // Tracing is diagnostic, so a failed write should not fail the build.
      // N.B. This is incredibly rare and a torn write means the data may be corrupted on disk.
      console.log(err)
    }
    this.size += offset
  }

  /**
   * Release the descriptor without flushing. Callers that want the buffered
   * tail on disk flush first; `rotate` deliberately does not.
   */
  private closeFd(): void {
    if (this.fd === undefined) {
      return
    }
    try {
      fs.closeSync(this.fd)
    } catch {
      // Nothing useful to do if the descriptor is already gone.
    }
    this.fd = undefined
  }

  /**
   * Flush and release the descriptor. Only needed when something else has to
   * act on the file (Windows cannot remove a file that is still open), which
   * in practice means tests -- the normal lifetime of the process is the
   * lifetime of the trace.
   */
  close(): void {
    this.flush()
    this.closeFd()
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

    const file = path.join(distDir, options.filename)
    // `distDir` can change within a process (most visibly between tests), so
    // a stream opened against a previous one must not keep receiving events.
    if (writeStream && writeStream.file !== file) {
      writeStream.close()
      writeStream = undefined
    }

    if (!writeStream) {
      // Constructing the stream touches no filesystem state -- the directory
      // and file are created lazily on the first write.
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
    close: () => {
      writeStream?.close()
      writeStream = undefined
    },
    report,
  }
}

export default createJsonReporter({
  filename: 'trace',
  sizeLimit: (phase) =>
    // Development is limited to 50MB, production is unlimited
    phase === PHASE_DEVELOPMENT_SERVER ? 52428800 : Infinity,
})
