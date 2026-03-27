import path from 'path'

export function resolveAppRelativeEditorPath(
  relativeFilePath: string,
  isSrcDir: boolean
) {
  const normalizedPath = relativeFilePath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')

  const expectedPrefix = isSrcDir ? 'src/app/' : 'app/'
  const alternatePrefix = isSrcDir ? 'app/' : 'src/app/'

  if (normalizedPath.startsWith(expectedPrefix)) {
    return normalizedPath
  }

  const expectedPrefixIndex = normalizedPath.indexOf(expectedPrefix)
  if (expectedPrefixIndex >= 0) {
    return normalizedPath.slice(expectedPrefixIndex)
  }

  const alternatePrefixIndex = normalizedPath.indexOf(alternatePrefix)
  if (alternatePrefixIndex >= 0) {
    return path.posix.join(
      expectedPrefix,
      normalizedPath.slice(alternatePrefixIndex + alternatePrefix.length)
    )
  }

  return path.posix.join(expectedPrefix, normalizedPath)
}
