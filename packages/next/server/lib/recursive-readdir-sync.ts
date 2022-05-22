import fs from 'fs'
import { join } from 'path'

/**
 * Recursively read directory
 * @param  {string[]=[]} arr This doesn't have to be provided, it's used for the recursion
 * @param  {string=dir`} rootDir Used to replace the initial path, only the relative path is left, it's faster than path.relative.
 * @returns Array holding all relative paths
 */
export function recursiveReadDirSync(
  dir: string,
  arr: string[] = [],
  rootDir = dir
): string[] {
  const result = fs.readdirSync(dir)

  result.forEach((part: string) => {
    const absolutePath = join(dir, part)
    const pathStat = fs.statSync(absolutePath)

    if (pathStat.isDirectory()) {
      recursiveReadDirSync(absolutePath, arr, rootDir)
      return
    }
    arr.push(absolutePath.replace(rootDir, ''))
  })

  return arr
}
