import path from 'path'

/**
 * Gets the glob patterns for type definition directories in tsconfig.
 *
 * Takes `distDirRoot`: the configured `distDir` as written, before the
 * development phase appends "/dev" to it. Both patterns are derived from it
 * directly, so this does not need to know which phase it is running in.
 *
 * Both are always included, so switching between dev and build does not churn
 * tsconfig.
 */
export function getTypeDefinitionGlobPatterns(distDirRoot: string): string[] {
  const rootPosix =
    path.win32.sep === path.sep
      ? distDirRoot.replaceAll(path.win32.sep, path.posix.sep)
      : distDirRoot

  // Ordered shortest first, as they were when this sorted them.
  return [`${rootPosix}/types/**/*.ts`, `${rootPosix}/dev/types/**/*.ts`]
}

/**
 * Gets the absolute path to the dev types directory for filtering during type-checking.
 * Returns null in dev mode (where dev types are the main types).
 */
export function getDevTypesPath(
  baseDir: string,
  distDir: string
): string | null {
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    // In dev mode, dev types are the main types, so no need to filter
    return null
  }

  // In build mode, dev types are at "{baseDir}/{distDir}/dev/types" and should be filtered
  return path.join(baseDir, distDir, 'dev', 'types')
}
