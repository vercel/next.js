import { globSync } from 'fast-glob'
import path from 'path'
import type { Rule } from 'eslint'

/**
 * Process a Next.js root directory glob.
 */
const processRootDir = (rootDir: string): string[] => {
  return globSync(rootDir.replace(/\\/g, '/'), {
    onlyDirectories: true,
  })
}

/**
 * Gets one or more Root, returns an array of root directories.
 */
export const getRootDirs = (context: Rule.RuleContext) => {
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

  const rootDirs = getRootDirs(context)
  const defaultCwd = context.cwd || process.cwd()
  const candidateDirs = rootDirs.length > 0 ? rootDirs : [defaultCwd]

  for (const rootDir of candidateDirs) {
    const resolvedPath = path.resolve(rootDir, filename)
    const relativePath = path
      .relative(rootDir, resolvedPath)
      .replace(/\\/g, '/')

    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      if (/^(src\/)?app(\/|$)/.test(relativePath)) {
        return true
      }
    }
  }

  return false
}
