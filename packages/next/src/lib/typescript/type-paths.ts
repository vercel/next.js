import path from 'path'

/**
 * Gets the glob patterns for type definition directories in tsconfig.
 * - "{typesDistDir}/types": route types shared by `next dev`, `next build`
 *   and `next typegen` (see `getSharedTypesDir`). Usually the same as
 *   "{distDir}/types", but not with `output: 'export'` and a custom `distDir`.
 * - "{distDir}/types" and "{distDir}/dev/types": in dev, the latter holds the
 *   types only `next dev` writes (`env.d.ts`, webpack type guards).
 * In development, the `distDir` passed in is "{distDir}/dev".
 */
export function getTypeDefinitionGlobPatterns(
  distDir: string,
  typesDistDir?: string
): string[] {
  const toPosix = (p: string) =>
    path.win32.sep === path.sep
      ? p.replaceAll(path.win32.sep, path.posix.sep)
      : p
  const distDirPosix = toPosix(distDir)

  const typeGlobPatterns: string[] = [`${distDirPosix}/types/**/*.ts`]

  // Include both .next/types and .next/dev/types to avoid tsconfig churn when switching
  // between dev/build modes. `next build` and `next typegen` remove the dev types
  // once the dev server has stopped, so they don't go stale (see `removeStaleDevTypes`).
  typeGlobPatterns.push(
    process.env.NODE_ENV === 'development'
      ? // In dev, distDir is "{distDir}/dev", so also include "{distDir}/types"
        `${distDirPosix.replace(/\/dev$/, '')}/types/**/*.ts`
      : // In build, distDir is "{distDir}", so also include "{distDir}/dev/types"
        `${distDirPosix}/dev/types/**/*.ts`
  )
  if (typesDistDir !== undefined) {
    const sharedTypes = `${toPosix(typesDistDir)}/types/**/*.ts`
    if (!typeGlobPatterns.includes(sharedTypes)) {
      typeGlobPatterns.push(sharedTypes)
    }
  }
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
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    // In dev mode, dev types are the main types, so no need to filter
    return null
  }

  // In build mode, dev types are at "{baseDir}/{distDir}/dev/types" and should be filtered
  return path.join(baseDir, distDir, 'dev', 'types')
}
