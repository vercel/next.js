import path from 'path'

/**
 * Gets the glob patterns for type definition directories in tsconfig.
 * Next.js uses different distDir paths in development vs production:
 * - Development: "{distDir}/dev"
 * - Production: "{distDir}"
 */
export function getTypeDefinitionGlobPatterns(distDir: string): string[] {
  const distDirPosix =
    path.win32.sep === path.sep
      ? distDir.replaceAll(path.win32.sep, path.posix.sep)
      : distDir

  const typeGlobPatterns: string[] = [`${distDirPosix}/types/**/*.ts`]

  // Include both .next/types and .next/dev/types to avoid tsconfig churn when switching
  // between dev/build modes
  typeGlobPatterns.push(
    process.env.NODE_ENV === 'development'
      ? // In dev, distDir is "{distDir}/dev", so also include "{distDir}/types"
        `${distDirPosix.replace(/\/dev$/, '')}/types/**/*.ts`
      : // In build, distDir is "{distDir}", so also include "{distDir}/dev/types"
        `${distDirPosix}/dev/types/**/*.ts`
  )
  // Sort for consistent order
  typeGlobPatterns.sort((a, b) => a.length - b.length)

  return typeGlobPatterns
}

/**
 * Gets the absolute path to the dev types directory for filtering during type-checking.
 * Returns null in dev mode (where dev types are the main types).
 */
export function getDevTypesPath(
  baseDir: string,
  distDir: string
): string | null {
  // Only skip filtering during the actual dev server (next dev), not during
  // next build where NODE_ENV is also 'development' but __NEXT_DEV_SERVER is
  // not set. This prevents stale .next/dev/types files from conflicting with
  // freshly generated .next/types files.
  if (process.env.__NEXT_DEV_SERVER) {
    // In dev mode, dev types are the main types, so no need to filter
    return null
  }

  // In build mode, dev types are at "{baseDir}/{distDir}/dev/types" and should be filtered
  return path.join(baseDir, distDir, 'dev', 'types')
}
