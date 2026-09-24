import { Writable } from 'node:stream'

type PendingOutput = {
  destination: Writable
  chunk: Buffer
  callback: ((error: Error | null) => void) | null
}

function write(destination: Writable, chunk: Buffer | string): Promise<void> {
  return new Promise((resolve, reject) => {
    destination.write(chunk, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

// Track only whether inserting screen-control bytes would split text or an
// escape sequence. This does not interpret or emulate the worker's terminal.
class OutputBoundary {
  private utf8 = 0
  private escape: 'none' | 'escape' | 'csi' | 'string' | 'string-escape' =
    'none'

  get complete() {
    return this.utf8 === 0 && this.escape === 'none'
  }

  write(chunk: Buffer) {
    for (const byte of chunk) {
      if (this.utf8 > 0 && (byte & 0xc0) === 0x80) {
        this.utf8--
        continue
      }
      this.utf8 = byte >= 0xf0 ? 3 : byte >= 0xe0 ? 2 : byte >= 0xc0 ? 1 : 0
      if (byte >= 0x80) {
        continue
      }
      if (byte === 0x18 || byte === 0x1a) {
        this.escape = 'none'
      } else if (this.escape === 'string-escape') {
        this.escape = byte === 0x5c ? 'none' : 'string'
      } else if (this.escape === 'string') {
        if (byte === 0x07) {
          this.escape = 'none'
        } else if (byte === 0x1b) {
          this.escape = 'string-escape'
        }
      } else if (byte === 0x1b) {
        this.escape = 'escape'
      } else if (this.escape === 'escape') {
        if (byte === 0x5b) {
          this.escape = 'csi'
        } else if ([0x50, 0x58, 0x5d, 0x5e, 0x5f].includes(byte)) {
          this.escape = 'string'
        } else if (byte >= 0x30 && byte <= 0x7e) {
          this.escape = 'none'
        }
      } else if (this.escape === 'csi' && byte >= 0x40 && byte <= 0x7e) {
        this.escape = 'none'
      }
    }
  }
}

/** Own worker output while the existing upgrade renderer owns the screen. */
export class UpgradeOutput {
  readonly stdout: Writable
  readonly stderr: Writable
  private queue: PendingOutput[] = []
  private bytes = 0
  private held = false
  private flushing: Promise<void> | null = null
  private failure: Error | null = null
  private onLimit: (() => void) | null = null
  private boundary = new OutputBoundary()
  private warning: string | null = null

  constructor(
    private terminal: Writable,
    private diagnostics: Writable,
    captureStderr: boolean,
    private limit = 1024 * 1024
  ) {
    const input = (destination: Writable) => {
      const stream = new Writable({
        write: (chunk: Buffer, _encoding, callback) => {
          if (this.failure) {
            callback(this.failure)
            return
          }
          if (chunk.length === 0) {
            callback()
            return
          }
          const entry: PendingOutput = { destination, chunk, callback }
          this.queue.push(entry)
          this.bytes += chunk.length
          if (this.held) {
            this.retain(entry)
          } else {
            this.flush()
          }
        },
      })
      // Failures are also reported by hold/whenDrained. Keep both pipe inputs
      // observed even if only one of them is currently being written.
      stream.on('error', () => {})
      return stream
    }
    this.stdout = input(terminal)
    // A redirected stderr must keep writing to its file during the menu.
    this.stderr = captureStderr ? input(diagnostics) : diagnostics
  }

  private retain(entry: PendingOutput) {
    if (this.bytes < this.limit) {
      const callback = entry.callback
      entry.callback = null
      callback?.(null)
    } else {
      const onLimit = this.onLimit
      this.onLimit = null
      onLimit?.()
      // Leave the callback pending until replay. This bounds the input streams'
      // own queues while cancellation restores the terminal.
    }
  }

  private flush() {
    if (this.held || this.flushing || this.failure) {
      return
    }
    this.flushing = (async () => {
      while (!this.held) {
        // A fallback diagnostic must not split the same incomplete sequence
        // that prevented the menu. A redirected stderr is safe independently.
        if (
          this.warning &&
          (this.boundary.complete || this.stderr === this.diagnostics)
        ) {
          const chunk = Buffer.from(this.warning)
          this.warning = null
          this.queue.unshift({
            destination: this.diagnostics,
            chunk,
            callback: null,
          })
          this.bytes += chunk.length
        }
        const entry = this.queue.shift()
        if (!entry) {
          break
        }
        this.bytes -= entry.chunk.length
        try {
          if (
            entry.destination === this.terminal ||
            this.stderr !== this.diagnostics
          ) {
            this.boundary.write(entry.chunk)
          }
          await write(entry.destination, entry.chunk)
          entry.callback?.(null)
        } catch (error) {
          this.failure = error as Error
          entry.callback?.(this.failure)
          for (const pending of this.queue.splice(0)) {
            pending.callback?.(this.failure)
          }
          this.bytes = 0
          // Retained writes were already acknowledged. Report replay failures
          // even if the worker never writes again, without closing the terminal.
          this.stdout.destroy(this.failure)
          break
        }
      }
    })().finally(() => {
      this.flushing = null
      if (this.queue.length > 0) {
        this.flush()
      }
    })
  }

  async hold(onLimit: () => void): Promise<boolean> {
    this.held = true
    this.onLimit = onLimit
    for (const entry of this.queue) {
      this.retain(entry)
    }
    await this.flushing
    if (this.failure) {
      throw this.failure
    }
    // An incomplete sequence may never finish. Decline this optional menu
    // instead of waiting for the worker or injecting ANSI into that sequence.
    return this.boundary.complete
  }

  async resume(warning: string | null = null): Promise<void> {
    try {
      // The renderer restores stdout directly. Its writes must finish before
      // replay can write stderr to the same terminal on asynchronous backends.
      await write(this.terminal, '')
    } finally {
      this.warning = warning
      this.onLimit = null
      this.held = false
      this.flush()
    }
  }

  async whenDrained(): Promise<void> {
    while (this.flushing) {
      await this.flushing
    }
    if (this.failure) {
      throw this.failure
    }
  }
}
