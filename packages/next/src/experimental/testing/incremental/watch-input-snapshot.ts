import type { BigIntStats } from 'fs'
import { lstat, readdir, stat } from 'fs/promises'
import path from 'path'
import { setImmediate } from 'timers/promises'

/** Directory timestamps change for children; report those children instead. */
export function watchInputSignature(stats: BigIntStats): string {
  const identity = `${stats.dev}:${stats.ino}:${stats.mode}`
  return stats.isDirectory()
    ? `directory:${identity}`
    : `${identity}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}`
}

/** A read-only reconciliation of observable paths, not compiler dependencies. */
export async function readWatchInputSnapshot(options: {
  roots: readonly string[]
  files: readonly string[]
  ignored(file: string): boolean
  signal: AbortSignal
}): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>()
  const pending = [
    ...options.roots.map((file) => ({ file, root: true })),
    ...options.files.map((file) => ({ file, root: false })),
  ]
  const reading = new Set<Promise<void>>()
  const concurrency = 32
  let cursor = 0
  let started = 0
  let failed = false
  let failure: unknown
  let wake: (() => void) | undefined

  function waitForRead() {
    return new Promise<void>((resolve) => {
      wake = resolve
    })
  }

  function start({ file, root }: { file: string; root: boolean }) {
    let work: Promise<void>
    work = (async () => {
      if (options.ignored(file)) return
      try {
        const stats = await (root ? stat : lstat)(file, { bigint: true })
        options.signal.throwIfAborted()
        const children = stats.isDirectory() ? await readdir(file) : []
        snapshot.set(file, watchInputSignature(stats))
        for (const child of children)
          pending.push({ file: path.join(file, child), root: false })
      } catch (error) {
        // A child can disappear or change type while its parent is scanned.
        // Root failures and inaccessible inputs must reach the watch owner.
        if (
          !root &&
          ((error as NodeJS.ErrnoException).code === 'ENOENT' ||
            (error as NodeJS.ErrnoException).code === 'ENOTDIR')
        ) {
          return
        }
        throw error
      }
    })()
      .catch((error) => {
        if (!failed) {
          failed = true
          failure = error
        }
      })
      .finally(() => {
        reading.delete(work)
        const waiting = wake
        wake = undefined
        waiting?.()
      })
    reading.add(work)
  }

  try {
    while (cursor < pending.length || reading.size) {
      options.signal.throwIfAborted()
      if (failed) throw failure
      // A slow path retains its slot without stalling other completed reads.
      // All slots remain owned until completion, cancellation or failure.
      while (cursor < pending.length && reading.size < concurrency) {
        start(pending[cursor++])
        started++
      }
      if (cursor >= 1024) {
        pending.splice(0, cursor)
        cursor = 0
      }
      if (reading.size) await waitForRead()
      if (started >= concurrency && cursor < pending.length) {
        started = 0
        await setImmediate(undefined, { signal: options.signal })
      }
    }
    options.signal.throwIfAborted()
    if (failed) throw failure
    return snapshot
  } finally {
    // Every started read settles before this owner releases, even when another
    // path failed or cancellation interrupted the next scheduling turn.
    await Promise.allSettled(reading)
  }
}
