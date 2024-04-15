import type { Dirent } from 'fs'
import { promises } from 'fs'
import { join, isAbsolute, dirname } from 'path'
import isError from './is-error'
import { wait } from './wait'

const unlinkPath = async (p: string, isDir = false, t = 1): Promise<void> => {
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
      t < 3
    ) {
      await wait(t * 100)
      return unlinkPath(p, isDir, t++)
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
        if (isDirectory) {
          await recursiveDelete(absolutePath, exclude, pp)
        }
        return unlinkPath(absolutePath, !isSymlink && isDirectory)
      }
    })
  )
}
