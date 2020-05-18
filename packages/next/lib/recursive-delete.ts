import { promises } from 'fs'
import { join } from 'path'
import { promisify } from 'util'

const sleep = promisify(setTimeout)

const unlinkFile = async (p: string, t = 1): Promise<void> => {
  try {
    await promises.unlink(p)
  } catch (e) {
    if (
      (e.code === 'EBUSY' ||
        e.code === 'ENOTEMPTY' ||
        e.code === 'EPERM' ||
        e.code === 'EMFILE') &&
      t < 3
    ) {
      await sleep(t * 100)
      return unlinkFile(p, t++)
    }

    if (e.code === 'ENOENT') {
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
    result = await promises.readdir(dir)
  } catch (e) {
    if (e.code === 'ENOENT') {
      return
    }
    throw e
  }

  await Promise.all(
    result.map(async (part: string) => {
      const absolutePath = join(dir, part)
      const pathStat = await promises.stat(absolutePath).catch((e) => {
        if (e.code !== 'ENOENT') throw e
      })
      if (!pathStat) {
        return
      }

      const pp = join(previousPath, part)
      if (pathStat.isDirectory() && (!exclude || !exclude.test(pp))) {
        await recursiveDelete(absolutePath, exclude, pp)
        return promises.rmdir(absolutePath)
      }

      if (!exclude || !exclude.test(pp)) {
        return unlinkFile(absolutePath)
      }
    })
  )
}
