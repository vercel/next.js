import path from 'path'

/**
 * Gets the absolute path to the dev types directory for filtering during type-checking.
 * Returns null if isolatedDevBuild is disabled or in dev mode (where dev types are the main types).
 */
export function getDevTypesPath(
  baseDir: string,
  distDir: string,
  isolatedDevBuild: boolean
): string | null {
  if (!isolatedDevBuild) {
    return null
  }

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    // In dev mode, dev types are the main types, so no need to filter
    return null
  }

  // In build mode, dev types are at "{baseDir}/{distDir}/dev/types" and should be filtered
  return path.join(baseDir, distDir, 'dev', 'types')
}
