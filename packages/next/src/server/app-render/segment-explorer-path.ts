import type { LoaderTree } from '../lib/app-dir-module'

export function normalizeConventionFilePath(
  projectDir: string,
  conventionPath: string | undefined
) {
  const cwd = process.env.NEXT_RUNTIME === 'edge' ? '' : process.cwd()
  const nextInternalPrefixRegex =
    /^(.*[\\/])?next[\\/]dist[\\/]client[\\/]components[\\/]builtin[\\/]/

  let relativePath = (conventionPath || '')
    // remove turbopack [project] prefix
    .replace(/^\[project\][\\/]/, '')
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
    relativePath = `__next_builtin__${relativePath}`
  }

  return relativePath
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
