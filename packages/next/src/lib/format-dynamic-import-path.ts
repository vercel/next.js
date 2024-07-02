import path from 'path'

function parseFileUrl(path: string) {
  try {
    const fileUrl = new URL(path)

    if (fileUrl.protocol === 'file:') {
      return fileUrl
    }
  } catch {
    //
  }

  return false
}

/**
 * The path for a dynamic import must be URLs with a valid file scheme.
 *
 * When an absolute Windows path is passed to it, it interprets the beginning of the path as a protocol (`C:`).
 * Therefore, it is important to always construct a complete path.
 * @param dir File directory
 * @param filePath Absolute or relative path
 */
export const formatDynamicImportPath = (dir: string, filePath: string) => {
  const fileUrl = parseFileUrl(filePath)

  if (fileUrl && path.isAbsolute(fileUrl.pathname)) {
    return fileUrl.href
  }

  const absoluteFilePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(dir, filePath)
  const normalizedAbsolutePath = path
    .normalize(absoluteFilePath)
    .replaceAll(path.sep, '/')
  const fullFileUrlPath = normalizedAbsolutePath.startsWith('/')
    ? `file://${normalizedAbsolutePath}`
    : `file:///${normalizedAbsolutePath}`

  return fullFileUrlPath
}
