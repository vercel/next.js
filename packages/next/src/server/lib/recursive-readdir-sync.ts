import fs from 'fs'
import { sep } from 'path'

/**
 * Recursively read directory
 * Returns array holding all relative paths
 */
export function recursiveReadDirSync(
  /** The directory to read */
  dir: string,
  /** This doesn't have to be provided, it's used for the recursion */
  arr: string[] = [],
  /** Used to remove the initial path suffix and leave only the relative, faster than path.relative. */
  rootDirLength = dir.length
): string[] {
  // Use opendirSync for better memory usage
  const result = fs.opendirSync(dir)

  let part: fs.Dirent | null
  while ((part = result.readSync())) {
    const absolutePath = dir + sep + part.name
    if (part.isDirectory()) {
      recursiveReadDirSync(absolutePath, arr, rootDirLength)
    } else {
      arr.push(absolutePath.slice(rootDirLength))
    }
  }

  result.closeSync()
  return arr
}
