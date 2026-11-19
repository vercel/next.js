import fs from 'fs'
import path from 'path'

/**
 * Synchronous diagnostic output. Callers buffer complete records and choose when
 * to rotate, so a file boundary never silently changes their serialization state.
 * Flushed bytes survive process.exit(); this does not fsync against power loss.
 */
export class RotatingFile {
  private fd: number | undefined
  // Callers recovering an existing file can seed this before writing.
  size = 0

  constructor(
    readonly file: string,
    private readonly sizeLimit: number
  ) {}

  wouldExceed(bytes: number): boolean {
    return this.size + bytes > this.sizeLimit
  }

  /**
   * Open lazily: opening before dev-server cleanup would leave writes going to
   * an unlinked inode. The mode only applies when opening a new descriptor.
   */
  open(mode: 'a' | 'w' = 'a'): number {
    if (this.fd === undefined) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const flags =
        fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_NOFOLLOW |
        (mode === 'a' ? fs.constants.O_APPEND : fs.constants.O_TRUNC)
      this.fd = fs.openSync(this.file, flags)
    }
    return this.fd
  }

  /** Discard the old contents when the size limit is reached. */
  rotate(): void {
    this.close()
    this.open('w')
    this.size = 0
  }

  write(data: Buffer, mode: 'a' | 'w' = 'a'): void {
    let offset = 0
    try {
      const fd = this.open(mode)
      // writeSync can write fewer than all the bytes.
      while (offset < data.length) {
        offset += fs.writeSync(fd, data, offset)
      }
    } finally {
      // Account for a partial write even if the caller handles an I/O error.
      this.size += offset
    }
  }

  close(): void {
    if (this.fd === undefined) return
    try {
      fs.closeSync(this.fd)
    } catch {
      // Nothing useful to do if the descriptor is already gone.
    }
    this.fd = undefined
  }
}
