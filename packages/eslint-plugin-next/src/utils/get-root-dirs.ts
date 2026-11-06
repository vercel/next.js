import { globSync } from 'fast-glob'
import path from 'path'
import type { Rule } from 'eslint'

/**
 * Process a Next.js root directory glob.
 */
const processRootDir = (rootDir: string): string[] => {
  const dirs = globSync(rootDir.replace(/\\/g, '/'), {
    onlyDirectories: true,
  })
  return dirs.length === 0 && !/[*?{}()[\]]/.test(rootDir) ? [rootDir] : dirs
}

const rootDirsCache = new WeakMap<Rule.RuleContext, string[]>()

/**
 * Gets one or more Root, returns an array of root directories.
 */
export const getRootDirs = (context: Rule.RuleContext) => {
  const cached = rootDirsCache.get(context)
  if (cached) {
    return cached
  }

  let rootDirs = [context.cwd]

  const nextSettings: { rootDir?: string | string[] } =
    context.settings?.next || {}
  let rootDir = nextSettings.rootDir

  if (typeof rootDir === 'string') {
    rootDirs = processRootDir(rootDir)
  } else if (Array.isArray(rootDir)) {
    rootDirs = rootDir
      .map((dir) => (typeof dir === 'string' ? processRootDir(dir) : []))
      .flat()
  }

  rootDirsCache.set(context, rootDirs)
  return rootDirs
}

/**
 * Checks whether the current file being linted is inside a Next.js `app` directory.
 */
export const isInAppDir = (context: Rule.RuleContext): boolean => {
  const filename = context.filename
  if (!filename || filename === '<text>' || filename === '<input>') {
    return false
  }

  const defaultCwd = context.cwd || process.cwd()
  const normalizedFile = path.resolve(defaultCwd, filename).replace(/\\/g, '/')

  const rootDirs = getRootDirs(context)
  const candidateDirs = rootDirs.length > 0 ? rootDirs : [defaultCwd]

  // 1. Check relative to candidateDirs (explicit rootDir or cwd)
  for (const rootDir of candidateDirs) {
    const resolvedRoot = path.resolve(rootDir).replace(/\\/g, '/')
    const relativePath = path
      .relative(resolvedRoot, normalizedFile)
      .replace(/\\/g, '/')

    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      if (/^(?:src\/)?app(?:\/|$)/.test(relativePath)) {
        return true
      }
      if (/^(?:src\/)?pages(?:\/|$)/.test(relativePath)) {
        return false
      }
    }
  }

  const normalizedCwd = path.resolve(defaultCwd).replace(/\\/g, '/')

  // 2. Check if linting from inside an app directory (e.g. cwd is .../app or .../src/app or a subroute)
  const cwdAppMatch = normalizedCwd.match(/^(.*?[\\/](?:src[\\/])?app)(?:[\\/].*)?$/)
  if (cwdAppMatch) {
    const appRoot = cwdAppMatch[1]
    const relToApp = path.relative(appRoot, normalizedFile).replace(/\\/g, '/')
    if (!relToApp.startsWith('..') && !path.isAbsolute(relToApp)) {
      return true
    }
  }

  // 3. Monorepo root or nested path without matching rootDir
  const relFromCwd = path
    .relative(normalizedCwd, normalizedFile)
    .replace(/\\/g, '/')
  const targetPath =
    !relFromCwd.startsWith('..') && !path.isAbsolute(relFromCwd)
      ? relFromCwd
      : normalizedFile

  if (/(?:^|\/)(?:src\/)?app\//.test(targetPath)) {
    if (/(?:^|\/)(?:src\/)?pages\//.test(targetPath)) {
      if (
        /(?:^|\/)(?:src\/)?app\/(?:(?!(?:^|\/)pages\/).)*pages\//.test(
          targetPath
        )
      ) {
        return true
      }
      return false
    }
    return true
  }

  return false
}
