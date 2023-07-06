import fs from 'fs'
import { join } from 'path'

/**
 * Recursively read directory
 * Returns array holding all relative paths
 */
export function recursiveReadDirSync(
  /** The directory to read */
  dir: string,
  /** This doesn't have to be provided, it's used for the recursion */
  arr: string[] = [],
  /** Used to replace the initial path, only the relative path is left, it's faster than path.relative. */
  rootDir = dir
): string[] {
  const result: fs.Dirent[] = fs.readdirSync(dir, { withFileTypes: true })

  result.forEach((part) => {
    const absolutePath = join(dir, part.path)

    if (part.isDirectory()) {
      recursiveReadDirSync(absolutePath, arr, rootDir)
      return
    }
    arr.push(absolutePath.replace(rootDir, ''))
  })

  return arr
}
