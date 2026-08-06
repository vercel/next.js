import type { Dirent } from 'node:fs'
import * as fs from 'node:fs'
import { join } from 'node:path'
import isError from './is-error'
import { wait } from './wait'

// We use an exponential backoff. See the unit test for example values.
//
// - Node's `fs` module uses a linear backoff, starting with 100ms.
// - Rust tries 64 times with only a `thread::yield_now` in between.
//
// We want something more aggressive, as `recursiveDelete` is in the critical
// path of `next dev` and `next build` startup.
const INITIAL_RETRY_MS = 8
const MAX_RETRY_MS = 64
const MAX_RETRIES = 6

/**
 * Used in unit test.
 * @ignore
 */
export function calcBackoffMs(attempt: number): number {
  return Math.min(INITIAL_RETRY_MS * Math.pow(2, attempt), MAX_RETRY_MS)
}

function unlinkPath(
  p: string,
  isDir = false,
  attempt = 0
): Promise<void> | void {
  try {
    if (isDir) {
      fs.rmdirSync(p)
    } else {
      fs.unlinkSync(p)
    }
  } catch (e) {
    const code = isError(e) && e.code
    if (
      (code === 'EBUSY' ||
        code === 'ENOTEMPTY' ||
        code === 'EPERM' ||
        code === 'EMFILE') &&
      attempt < MAX_RETRIES
    ) {
      // retrying is unlikely to succeed on POSIX platforms, but Windows can
      // fail due to temporarily-open files
      return (async () => {
        await wait(calcBackoffMs(attempt))
        return unlinkPath(p, isDir, attempt + 1)
      })()
    }

    if (code === 'ENOENT') {
      return
    }

    throw e
  }
}

/**
 * Recursively delete directory contents.
 *
 * This is used when cleaning the `distDir`, and is part of the critical path
 * for starting the server, so we use synchronous file IO, as we're always
 * blocked on it anyways.
 *
 * Despite using sync IO, the function signature is still `async` because we
 * asynchronously perform retries.
 */
export async function recursiveDeleteSyncWithAsyncRetries(
  /** Directory to delete the contents of */
  dir: string,
  /** Exclude based on relative file path */
  exclude?: RegExp,
  /** Relative path to the directory being deleted, used for exclude */
  previousPath: string = ''
): Promise<void> {
  let result
  try {
    result = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    if (isError(e) && e.code === 'ENOENT') {
      return
    }
    throw e
  }

  await Promise.all(
    result.map(async (part: Dirent) => {
      const absolutePath = join(dir, part.name)
      const pp = join(previousPath, part.name)
      const isNotExcluded = !exclude || !exclude.test(pp)

      if (isNotExcluded) {
        // Note: readdir does not follow symbolic links, that's good: we want to
        // delete the links and not the destination.
        let isDirectory = part.isDirectory()
        if (isDirectory) {
          await recursiveDeleteSyncWithAsyncRetries(absolutePath, exclude, pp)
        }
        return unlinkPath(absolutePath, isDirectory)
      }
    })
  )
}
