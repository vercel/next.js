import { Dirent, promises } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import isError from './is-error'

const sleep = promisify(setTimeout)

const unlinkFile = async (p: string, t = 1): Promise<void> => {
  try {
    await promises.unlink(p)
  } catch (e) {
    const code = isError(e) && e.code
    if (
      (code === 'EBUSY' ||
        code === 'ENOTEMPTY' ||
        code === 'EPERM' ||
        code === 'EMFILE') &&
      t < 3
    ) {
      await sleep(t * 100)
      return unlinkFile(p, t++)
    }

    if (code === 'ENOENT') {
      return
    }

    throw e
  }
}

/**
 * Recursively delete directory contents
 * @param  {string} dir Directory to delete the contents of
 * @param  {RegExp} [exclude] Exclude based on relative file path
 * @param  {string} [previousPath] Ensures that parameter dir exists, this is not passed recursively
 * @returns Promise void
 */
export async function recursiveDelete(
  dir: string,
  exclude?: RegExp,
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
      if (part.isSymbolicLink()) {
        const stats = await promises.stat(absolutePath)
        isDirectory = stats.isDirectory()
      }

      const pp = join(previousPath, part.name)
      if (isDirectory && (!exclude || !exclude.test(pp))) {
        await recursiveDelete(absolutePath, exclude, pp)
        return promises.rmdir(absolutePath)
      }

      if (!exclude || !exclude.test(pp)) {
        return unlinkFile(absolutePath)
      }
    })
  )
}
