import type { LoaderTree } from '../lib/app-dir-module'

export const BUILTIN_PREFIX = '__next_builtin__'

const nextInternalPrefixRegex =
  /^(.*[\\/])?next[\\/]dist[\\/]client[\\/]components[\\/]builtin[\\/]/
const normalizedNextInternalPrefix = 'next/dist/client/components/builtin/'
const lineTerminatorRegex = /[\n\r\u2028\u2029]/

function removeFirstOccurrence(value: string, search: string): string {
  const index = value.indexOf(search)
  if (index === -1) {
    return value
  }
  return value.slice(0, index) + value.slice(index + search.length)
}

function removeLeadingPathSeparator(value: string): string {
  const first = value.charCodeAt(0)
  return first === 47 || first === 92 ? value.slice(1) : value
}

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
  const relativeProjectRoot = removeLeadingPathSeparator(
    removeFirstOccurrence(projectDir, cwd)
  )

  let relativePath = filePath || ''
  if (relativePath.startsWith('[project]')) {
    relativePath = removeLeadingPathSeparator(relativePath.slice(9))
  }
  relativePath = removeFirstOccurrence(relativePath, projectDir)
  relativePath = removeFirstOccurrence(relativePath, cwd)
  if (relativePath.includes('\\')) {
    relativePath = relativePath.replaceAll('\\', '/')
  }
  relativePath = removeLeadingPathSeparator(relativePath)

  // remove relative project path prefix (e.g., "test/e2e/app-dir/actions/")
  if (relativeProjectRoot && relativePath.startsWith(relativeProjectRoot)) {
    relativePath = removeLeadingPathSeparator(
      relativePath.slice(relativeProjectRoot.length)
    )
  }

  // Handle case where filename is relative to a parent of projectDir
  // (e.g., in tests where filename is "test/tmp/next-test-XXX/app/page.js"
  // but projectDir is the test temp directory)
  if (relativePath.includes('/')) {
    const projectDirNameStart =
      Math.max(projectDir.lastIndexOf('/'), projectDir.lastIndexOf('\\')) + 1
    const projectDirName = projectDir.slice(projectDirNameStart)
    if (projectDirName) {
      const idx = relativePath.indexOf(projectDirName + '/')
      if (idx >= 0) {
        relativePath = relativePath.slice(idx + projectDirName.length + 1)
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
  if (relativePath.startsWith('src/app/')) {
    relativePath = relativePath.slice(8)
  } else if (relativePath.startsWith('app/')) {
    relativePath = relativePath.slice(4)
  }

  // If it's internal file only keep the filename, strip nextjs internal prefix.
  // Search from the end to preserve the greedy regex's last-prefix semantics.
  let firstLineTerminatorIndex: number | undefined
  let internalPrefixIndex = relativePath.length
  while (
    (internalPrefixIndex = relativePath.lastIndexOf(
      normalizedNextInternalPrefix,
      internalPrefixIndex - 1
    )) !== -1
  ) {
    if (
      internalPrefixIndex === 0 ||
      relativePath.charCodeAt(internalPrefixIndex - 1) === 47
    ) {
      if (firstLineTerminatorIndex === undefined) {
        const index = relativePath.search(lineTerminatorRegex)
        firstLineTerminatorIndex = index === -1 ? relativePath.length : index
      }
      if (internalPrefixIndex < firstLineTerminatorIndex) {
        // Add a special prefix to let segment explorer know it's a built-in component
        relativePath =
          BUILTIN_PREFIX +
          relativePath.slice(
            internalPrefixIndex + normalizedNextInternalPrefix.length
          )
        break
      }
    }
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
