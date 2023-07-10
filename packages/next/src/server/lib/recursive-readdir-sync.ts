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
  // Use opendirSync for better memory usage
  const result = fs.opendirSync(dir)

  let part: fs.Dirent | null
  while ((part = result.readSync())) {
    const absolutePath = join(dir, part.name)
    if (part.isDirectory()) {
      recursiveReadDirSync(absolutePath, arr, rootDir)
    } else {
      arr.push(absolutePath.slice(rootDir.length))
    }
  }

  result.closeSync()
  return arr
}
