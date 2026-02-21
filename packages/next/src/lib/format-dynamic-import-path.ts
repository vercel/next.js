import path from 'path'
import { pathToFileURL } from 'url'

/**
 * The path for a dynamic route must be URLs with a valid scheme.
 *
 * When an absolute Windows path is passed to it, it interprets the beginning of the path as a protocol (`C:`).
 * Therefore, it is important to always construct a complete path.
 * @param dir File directory
 * @param filePath Absolute or relative path, or a file:// URL
 */
export const formatDynamicImportPath = (dir: string, filePath: string) => {
  // If the path is already a file:// URL (e.g. from import.meta.resolve()
  // in ESM configs), it's already a valid URL for dynamic import.
  if (filePath.startsWith('file://')) {
    return filePath
  }

  const absoluteFilePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(dir, filePath)
  const formattedFilePath = pathToFileURL(absoluteFilePath).toString()

  return formattedFilePath
}
