import path from 'path'

/**
 * Checks if a file path is within a directory.
 * @param file The file path to check.
 * @param dir The directory to compare against.
 * @param recursive Determines if the read operation is recursive.
 * @param pathSeparator The path separator to use.
 * @returns `true` if the file is within the directory; otherwise, `false`.
 */
export function isFileInDirectory(
  file: string,
  dir: string,
  recursive: boolean,
  pathSeparator: string = path.sep
): boolean {
  if (!file.startsWith(dir) || file === dir) {
    // If the file does not start with the directory path, it is not in the directory
    return false
  }

  if (!recursive) {
    // If the read operation is not recursive, file must be in the same directory
    return file.lastIndexOf(pathSeparator) <= dir.length
  }

  // For recursive reads, file must be in the directory or a subdirectory
  return true
}
