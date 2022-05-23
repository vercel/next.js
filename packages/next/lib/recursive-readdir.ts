import { Dirent, promises } from 'fs'
import { join } from 'path'

/**
 * Recursively read directory
 * @param  {string} dir Directory to read
 * @param  {RegExp} filter Filter for the file name, only the name part is considered, not the full path
 * @param  {string[]=[]} arr This doesn't have to be provided, it's used for the recursion
 * @param  {string=dir`} rootDir Used to replace the initial path, only the relative path is left, it's faster than path.relative.
 * @returns Promise array holding all relative paths
 */
export async function recursiveReadDir(
  dir: string,
  filter: RegExp,
  ignore?: RegExp,
  arr: string[] = [],
  rootDir: string = dir
): Promise<string[]> {
  const result = await promises.readdir(dir, { withFileTypes: true })

  await Promise.all(
    result.map(async (part: Dirent) => {
      const absolutePath = join(dir, part.name)
      if (ignore && ignore.test(part.name)) return

      // readdir does not follow symbolic links
      // if part is a symbolic link, follow it using stat
      let isDirectory = part.isDirectory()
      if (part.isSymbolicLink()) {
        const stats = await promises.stat(absolutePath)
        isDirectory = stats.isDirectory()
      }

      if (isDirectory) {
        await recursiveReadDir(absolutePath, filter, ignore, arr, rootDir)
        return
      }

      if (!filter.test(part.name)) {
        return
      }

      arr.push(absolutePath.replace(rootDir, ''))
    })
  )

  return arr.sort()
}
