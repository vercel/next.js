import type { Dirent } from 'fs'
import { promises } from 'fs'
import { join, isAbsolute, dirname } from 'path'
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

const unlinkPath = async (
  p: string,
  isDir = false,
  attempt = 0
): Promise<void> => {
  try {
    if (isDir) {
      await promises.rmdir(p)
    } else {
      await promises.unlink(p)
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
      // fail due to temporarily-open files or due to
      await wait(calcBackoffMs(attempt))
      return unlinkPath(p, isDir, attempt + 1)
    }

    if (code === 'ENOENT') {
      return
    }

    throw e
  }
}

/**
 * Recursively delete directory contents
 */
export async function recursiveDelete(
  /** Directory to delete the contents of */
  dir: string,
  /** Exclude based on relative file path */
  exclude?: RegExp,
  /** Ensures that parameter dir exists, this is not passed recursively */
  previousPath: string = ''
): Promise<void> {
  let result
  try {
    result = await promises.readdir(dir, { withFileTypes: true })
  } catch (e) {
    if (isError(e) && e.code === 'ENOENT') {
      return
    }
    throw e
  }

  await Promise.all(
    result.map(async (part: Dirent) => {
      const absolutePath = join(dir, part.name)

      // readdir does not follow symbolic links
      // if part is a symbolic link, follow it using stat
      let isDirectory = part.isDirectory()
      const isSymlink = part.isSymbolicLink()

      if (isSymlink) {
        const linkPath = await promises.readlink(absolutePath)

        try {
          const stats = await promises.stat(
            isAbsolute(linkPath)
              ? linkPath
              : join(dirname(absolutePath), linkPath)
          )
          isDirectory = stats.isDirectory()
        } catch {}
      }

      const pp = join(previousPath, part.name)
      const isNotExcluded = !exclude || !exclude.test(pp)

      if (isNotExcluded) {
        if (!isSymlink && isDirectory) {
          await recursiveDelete(absolutePath, exclude, pp)
        }
        return unlinkPath(absolutePath, !isSymlink && isDirectory)
      }
    })
  )
}
