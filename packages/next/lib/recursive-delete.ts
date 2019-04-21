import fs from 'fs'
import { join } from 'path'
import { promisify } from 'util'

const readdir = promisify(fs.readdir)
const stat = promisify(fs.stat)
const rmdir = promisify(fs.rmdir)
const unlink = promisify(fs.unlink)
const sleep = promisify(setTimeout)

const unlinkFile = async (p: string, t = 1): Promise<void> => {
  try {
    await unlink(p)
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
 * @param  {RegExp} [filter] Filter for the relative file path
 * @param  {boolean} [ensure] Ensures that parameter dir exists, this is not passed recursively
 * @param  {string} [previousPath] Ensures that parameter dir exists, this is not passed recursively
 * @returns Promise void
 */
export async function recursiveDelete(
  dir: string,
  filter?: RegExp,
  previousPath: string = '',
  ensure?: boolean,
): Promise<void> {
  let result
  try {
    result = await readdir(dir)
  } catch (e) {
    if (e.code === 'ENOENT' && !ensure) {
      return
    }
    throw e
  }

  await Promise.all(
    result.map(async (part: string) => {
      const absolutePath = join(dir, part)
      const pathStat = await stat(absolutePath).catch((e) => {
        if (e.code !== 'ENOENT') throw e
      })
      if (!pathStat) {
        return
      }

      if (pathStat.isDirectory()) {
        const pp = join(previousPath, part)
        await recursiveDelete(absolutePath, filter, pp)

        if (!filter || filter.test(pp)) {
          return rmdir(absolutePath)
        }
        return
      }

      if (!filter || filter.test(join(previousPath, part))) {
        return unlinkFile(absolutePath)
      }
    }),
  )
}
