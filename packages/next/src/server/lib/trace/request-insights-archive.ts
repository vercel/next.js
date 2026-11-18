import { createReadStream, createWriteStream } from 'fs'
import { open, readdir, rename, stat, unlink, utimes } from 'fs/promises'
import path from 'path'
import { createInterface } from 'readline'
import { pipeline } from 'stream/promises'
import { createGzip } from 'zlib'
import isError from '../../../lib/is-error'
import type { RotatingFile } from '../../../lib/rotating-file'

const ARCHIVE_MAX_AGE = 7 * 24 * 60 * 60 * 1000
const ARCHIVE_MAX_BYTES = 100 * 1024 * 1024
// Names describe request start times, not rotation times. Colons are omitted for Windows.
const ARCHIVE_NAME =
  /^(?:\d{8}T\d{6}Z--\d{8}T\d{6}Z|unknown)(?:-(\d+))?\.ndjson(\.gz)?(\.tmp)?$/

type Archive = {
  file: string
  collision: number
  size: number
  rotatedAt: number
}

/** Closed files only: the dev-server lock and journal queue protect all mutations. */
export class RequestInsightsArchives {
  private earliest = Infinity
  private latest = -Infinity

  constructor(private readonly writer: RotatingFile) {}

  recordTime(time: number): void {
    // Stay within four-digit UTC years, including after rounding the upper bound.
    if (!Number.isFinite(time) || time < 0 || time > 253402300798000) return
    this.earliest = Math.min(this.earliest, time)
    this.latest = Math.max(this.latest, time)
  }

  /** Recover timestamp bounds and byte size in one startup scan. */
  async scanActiveFile(): Promise<number> {
    this.earliest = Infinity
    this.latest = -Infinity
    const input = createReadStream(this.writer.file, { encoding: 'utf8' })
    const lines = createInterface({ input, crlfDelay: Infinity })
    try {
      for await (const line of lines) {
        try {
          const record = JSON.parse(line)
          if (
            typeof record?.request?.requestId === 'string' &&
            typeof record.request.htmlRequestId === 'string' &&
            typeof record.request.startTime === 'number'
          ) {
            this.recordTime(record.request.startTime)
          }
        } catch {
          // A malformed line must not hide the range of the remaining records.
        }
      }
    } catch (error) {
      if (!isError(error) || error.code !== 'ENOENT') throw error
    } finally {
      lines.close()
      input.destroy()
    }
    return input.bytesRead
  }

  async rotate(): Promise<void> {
    if (this.writer.size === 0) {
      this.writer.open()
      return
    }
    const directory = path.dirname(this.writer.file)

    const range = Number.isFinite(this.earliest)
      ? `${formatTime(Math.floor(this.earliest / 1000) * 1000)}--${formatTime(Math.ceil(this.latest / 1000) * 1000)}`
      : 'unknown'
    const names = new Set(await readdir(directory))
    const previous =
      (await listArchives(this.writer.file)).at(-1)?.rotatedAt ?? 0
    // mtime is the rotation order, independent of overlapping request-time ranges.
    // Keep it strictly increasing even if two rotations share a clock tick.
    const rotatedAt = Math.max(Date.now(), Math.ceil(previous) + 1) / 1000
    let closedFile: string
    for (let collision = 0; ; collision++) {
      const name = `${range}${collision ? `-${collision}` : ''}.ndjson`
      if (['', '.gz', '.gz.tmp'].some((suffix) => names.has(name + suffix)))
        continue
      closedFile = path.join(directory, name)
      try {
        // Reserve the name, so a collision never overwrites another closed file.
        await (await open(closedFile, 'wx')).close()
        break
      } catch (error) {
        if (!isError(error) || error.code !== 'EEXIST') throw error
      }
    }
    try {
      // Close before renaming (including on Windows); never truncate an open reader.
      this.writer.rotate(closedFile)
    } catch (error) {
      await removeArchiveFile(closedFile)
      throw error
    }
    // Outside the reservation rollback: a failed reopen must not delete history.
    this.writer.open()
    this.earliest = Infinity
    this.latest = -Infinity
    await utimes(closedFile, rotatedAt, rotatedAt)
  }

  /** Retry interrupted compression before pruning; never discard its only source. */
  async maintain(): Promise<void> {
    try {
      const archives = await listArchives(this.writer.file)
      const files = new Set(archives.map((archive) => archive.file))
      for (const archive of archives) {
        try {
          if (
            archive.file.endsWith('.tmp') ||
            files.has(`${archive.file}.gz`)
          ) {
            // Drop interrupted outputs and sources whose gzip is already published.
            await removeArchiveFile(archive.file)
          } else if (!archive.file.endsWith('.gz')) {
            await compressArchive(archive)
          }
        } catch (error) {
          console.warn('Failed to compress Request Insights archive', error)
        }
      }

      const complete = (await listArchives(this.writer.file)).filter(
        (archive) => archive.file.endsWith('.gz')
      )
      let bytes = complete.reduce((total, archive) => total + archive.size, 0)
      const cutoff = Date.now() - ARCHIVE_MAX_AGE
      // Protect the newest archive even if it alone exceeds either limit.
      for (const archive of complete.slice(0, -1)) {
        if (archive.rotatedAt < cutoff || bytes > ARCHIVE_MAX_BYTES) {
          if (await removeArchiveFile(archive.file)) bytes -= archive.size
        }
      }
    } catch (error) {
      // Diagnostic housekeeping must not prevent the dev server from starting.
      console.warn('Failed to maintain Request Insights archives', error)
    }
  }
}

/** Replay closed sources too if compression previously failed. Prefer published gzip. */
export async function getRequestInsightsArchiveFiles(
  activeFile: string
): Promise<string[]> {
  const files = (await listArchives(activeFile)).map((archive) => archive.file)
  const published = new Set(files)
  return files.filter(
    (file) => !file.endsWith('.tmp') && !published.has(`${file}.gz`)
  )
}

async function listArchives(activeFile: string): Promise<Archive[]> {
  const directory = path.dirname(activeFile)
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (isError(error) && error.code === 'ENOENT') return []
    throw error
  }
  const archives: Archive[] = []
  for (const entry of entries) {
    const match = ARCHIVE_NAME.exec(entry.name)
    if (!entry.isFile() || !match || (match[3] && !match[2])) continue
    const file = path.join(directory, entry.name)
    try {
      const info = await stat(file)
      archives.push({
        file,
        collision: Number(match[1] ?? 0),
        size: info.size,
        rotatedAt: info.mtimeMs,
      })
    } catch (error) {
      if (!isError(error) || error.code !== 'ENOENT') throw error
    }
  }
  return archives.sort(
    (a, b) =>
      a.rotatedAt - b.rotatedAt ||
      a.collision - b.collision ||
      a.file.localeCompare(b.file)
  )
}

async function compressArchive(archive: Archive): Promise<void> {
  const temporary = `${archive.file}.gz.tmp`
  // A previous attempt may have left a partial output newer than this source.
  await removeArchiveFile(temporary)
  try {
    await pipeline(
      createReadStream(archive.file),
      createGzip(),
      createWriteStream(temporary, { flags: 'wx' })
    )
    // Pass seconds directly: Date would truncate fractional milliseconds and
    // can make successive rotations tie on older Node versions.
    const rotatedAt = archive.rotatedAt / 1000
    await utimes(temporary, rotatedAt, rotatedAt)
    await rename(temporary, `${archive.file}.gz`)
  } catch (error) {
    // The complete uncompressed source remains available for reads and retry.
    await removeArchiveFile(temporary)
    throw error
  }
  await removeArchiveFile(archive.file)
}

async function removeArchiveFile(file: string): Promise<boolean> {
  try {
    await unlink(file)
    return true
  } catch (error) {
    if (isError(error) && error.code === 'ENOENT') return true
    console.warn('Failed to remove Request Insights archive file', error)
    return false
  }
}

function formatTime(time: number): string {
  return new Date(time).toISOString().replace(/[-:]/g, '').replace('.000', '')
}
