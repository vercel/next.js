/**
 * Get pathname from absolute path.
 *
 * @param absolutePath the absolute path
 * @returns the pathname
 */
export function getPathnameFromAbsolutePath(absolutePath: string) {
  // Remove prefix including app dir
  let appDir = '/app/'
  if (!absolutePath.includes(appDir)) {
    appDir = '\\app\\'
  }
  const [, ...parts] = absolutePath.split(appDir)
  const relativePath = appDir[0] + parts.join(appDir)

  // remove extension
  const pathname = relativePath.split('.').slice(0, -1).join('.')
  return pathname
}
