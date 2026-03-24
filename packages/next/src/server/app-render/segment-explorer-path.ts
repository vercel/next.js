import type { LoaderTree } from '../lib/app-dir-module'

export const BUILTIN_PREFIX = '__next_builtin__'

const nextInternalPrefixRegex =
  /^(.*[\\/])?next[\\/]dist[\\/]client[\\/]components[\\/]builtin[\\/]/

/**
 * Normalize a file path to be relative to the project directory.
 * Handles Turbopack [project] prefix and monorepo setups.
 */
export function normalizeFilePath(
  projectDir: string,
  filePath: string | undefined
): string {
  // Turbopack project path is formed as: "<project root>/<cwd>".
  // When project root is not the working directory, we can extract the relative project root path.
  // This is mostly used for running Next.js inside a monorepo.
  const cwd = process.env.NEXT_RUNTIME === 'edge' ? '' : process.cwd()
  const relativeProjectRoot = projectDir.replace(cwd, '').replace(/^[\\/]/, '')

  let relativePath = (filePath || '')
    // remove turbopack [project] prefix
    .replace(/^\[project\][\\/]?/, '')
    // remove the project root from the path (absolute)
    .replace(projectDir, '')
    // remove cwd prefix (absolute)
    .replace(cwd, '')
    // normalize path separators and remove leading slash
    .replace(/\\/g, '/')
    .replace(/^\//, '')

  // remove relative project path prefix (e.g., "test/e2e/app-dir/actions/")
  if (relativeProjectRoot && relativePath.startsWith(relativeProjectRoot)) {
    relativePath = relativePath
      .slice(relativeProjectRoot.length)
      .replace(/^\//, '')
  }

  // Handle case where filename is relative to a parent of projectDir
  // (e.g., in tests where filename is "test/tmp/next-test-XXX/app/page.js"
  // but projectDir is the test temp directory)
  if (relativePath.includes('/')) {
    const projectDirName = projectDir.split(/[\\/]/).pop() || ''
    if (projectDirName) {
      const projectDirWithSlash = projectDirName + '/'
      const idx = relativePath.indexOf(projectDirWithSlash)
      if (idx >= 0) {
        relativePath = relativePath.slice(idx + projectDirWithSlash.length)
      }
    }
  }

  return relativePath
}

export function normalizeConventionFilePath(
  projectDir: string,
  conventionPath: string | undefined
) {
  let relativePath = normalizeFilePath(projectDir, conventionPath)
    // remove /(src/)?app/ dir prefix
    .replace(/^(src\/)?app\//, '')

  // If it's internal file only keep the filename, strip nextjs internal prefix
  if (nextInternalPrefixRegex.test(relativePath)) {
    relativePath = relativePath.replace(nextInternalPrefixRegex, '')
    // Add a special prefix to let segment explorer know it's a built-in component
    relativePath = `${BUILTIN_PREFIX}${relativePath}`
  }

  return relativePath
}

// if a filepath is a builtin file. e.g.
// .../project/node_modules/next/dist/client/components/builtin/global-error.js -> true
// .../project/app/global-error.js -> false
export const isNextjsBuiltinFilePath = (filePath: string) => {
  return nextInternalPrefixRegex.test(filePath)
}

export const BOUNDARY_SUFFIX = '@boundary'
export function normalizeBoundaryFilename(filename: string) {
  return filename
    .replace(new RegExp(`^${BUILTIN_PREFIX}`), '')
    .replace(new RegExp(`${BOUNDARY_SUFFIX}$`), '')
}

export const BOUNDARY_PREFIX = 'boundary:'
export function isBoundaryFile(fileType: string) {
  return fileType.startsWith(BOUNDARY_PREFIX)
}

// if a filename is a builtin file.
// __next_builtin__global-error.js -> true
// page.js -> false
export function isBuiltinBoundaryFile(fileType: string) {
  return fileType.startsWith(BUILTIN_PREFIX)
}

export function getBoundaryOriginFileType(fileType: string) {
  return fileType.replace(BOUNDARY_PREFIX, '')
}

export function getConventionPathByType(
  tree: LoaderTree,
  dir: string,
  conventionType:
    | 'layout'
    | 'template'
    | 'page'
    | 'not-found'
    | 'error'
    | 'loading'
    | 'forbidden'
    | 'unauthorized'
    | 'defaultPage'
    | 'global-error'
) {
  const modules = tree[2]
  const conventionPath = modules[conventionType]
    ? modules[conventionType][1]
    : undefined
  if (conventionPath) {
    return normalizeConventionFilePath(dir, conventionPath)
  }
  return undefined
}
