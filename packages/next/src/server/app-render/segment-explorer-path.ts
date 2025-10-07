import type { LoaderTree } from '../lib/app-dir-module'

export const BUILTIN_PREFIX = '__next_builtin__'

const nextInternalPrefixRegex =
  /^(.*[\\/])?next[\\/]dist[\\/]client[\\/]components[\\/]builtin[\\/]/

export function normalizeConventionFilePath(
  projectDir: string,
  conventionPath: string | undefined
) {
  // Turbopack project path is formed as: "<project root>/<cwd>".
  // When project root is not the working directory, we can extract the relative project root path.
  // This is mostly used for running Next.js inside a monorepo.
  const cwd = process.env.NEXT_RUNTIME === 'edge' ? '' : process.cwd()
  const relativeProjectRoot = projectDir.replace(cwd, '')

  let relativePath = (conventionPath || '')
    // remove turbopack [project] prefix
    .replace(/^\[project\]/, '')
    // remove turbopack relative project path, everything after [project] and before the working directory.
    .replace(relativeProjectRoot, '')
    // remove the project root from the path
    .replace(projectDir, '')
    // remove cwd prefix
    .replace(cwd, '')
    // remove /(src/)?app/ dir prefix
    .replace(/^([\\/])*(src[\\/])?app[\\/]/, '')

  // If it's internal file only keep the filename, strip nextjs internal prefix
  if (nextInternalPrefixRegex.test(relativePath)) {
    relativePath = relativePath.replace(nextInternalPrefixRegex, '')
    // Add a special prefix to let segment explorer know it's a built-in component
    relativePath = `${BUILTIN_PREFIX}${relativePath}`
  }

  return relativePath.replace(/\\/g, '/')
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
