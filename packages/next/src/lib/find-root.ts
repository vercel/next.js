import { dirname, join, posix, relative } from 'path'
import { existsSync, readFileSync } from 'fs'
import findUp from 'next/dist/compiled/find-up'
import picomatch from 'next/dist/compiled/picomatch'
import * as Log from '../build/output/log'
import { normalizePath } from './normalize-path'

function normalizeWorkspacePattern(pattern: string) {
  const isExcluded = pattern.startsWith('!')
  let normalizedPattern = normalizePath(isExcluded ? pattern.slice(1) : pattern)

  while (normalizedPattern.startsWith('./')) {
    normalizedPattern = normalizedPattern.slice(2)
  }
  while (normalizedPattern.endsWith('/')) {
    normalizedPattern = normalizedPattern.slice(0, -1)
  }

  return `${isExcluded ? '!' : ''}${normalizedPattern}`
}

function getWorkspacePatternStrings(workspaces: unknown): string[] {
  if (Array.isArray(workspaces)) {
    return workspaces.filter((item): item is string => typeof item === 'string')
  }

  if (
    workspaces &&
    typeof workspaces === 'object' &&
    Array.isArray((workspaces as { packages?: unknown }).packages)
  ) {
    return (workspaces as { packages: unknown[] }).packages.filter(
      (item): item is string => typeof item === 'string'
    )
  }

  return []
}

function getWorkspacePatterns(workspaceRoot: string): string[] {
  const packageJsonPath = join(workspaceRoot, 'package.json')

  if (!existsSync(packageJsonPath)) {
    return []
  }

  let workspaces: unknown
  try {
    workspaces = JSON.parse(readFileSync(packageJsonPath, 'utf8')).workspaces
  } catch {
    return []
  }

  return getWorkspacePatternStrings(workspaces)
    .map(normalizeWorkspacePattern)
    .filter((item) => item !== '' && item !== '!')
}

function isAppInWorkspace(workspaceRoot: string, appDir: string) {
  const relativeAppDir = normalizePath(relative(workspaceRoot, appDir))

  if (
    !relativeAppDir ||
    relativeAppDir === '.' ||
    relativeAppDir.startsWith('../') ||
    relativeAppDir === '..'
  ) {
    return false
  }

  const candidateDirs: string[] = []
  let candidateDir = relativeAppDir
  while (candidateDir && candidateDir !== '.') {
    candidateDirs.push(candidateDir)
    const parentDir = posix.dirname(candidateDir)
    if (parentDir === candidateDir || parentDir === '.') {
      break
    }
    candidateDir = parentDir
  }

  const workspacePatterns = getWorkspacePatterns(workspaceRoot).map(
    (pattern) => {
      const isExcluded = pattern.startsWith('!')
      return {
        isExcluded,
        match: picomatch(isExcluded ? pattern.slice(1) : pattern),
      }
    }
  )
  const matchesWorkspacePattern = (candidate: string) => {
    let hasInclude = false
    for (const { isExcluded, match } of workspacePatterns) {
      if (!match(candidate)) {
        continue
      }
      if (isExcluded) {
        return false
      }
      hasInclude = true
    }
    return hasInclude
  }

  return candidateDirs.some((candidate) => matchesWorkspacePattern(candidate))
}

function findWorkRoot(cwd: string) {
  // Find-up evaluates the list of files at each level.
  // For pnpm-workspace.yaml we first want to look up before searching for lockfiles as those can be included in the application directory by accident.
  const pnpmWorkspaceFile = findUp.sync(
    'pnpm-workspace.yaml',

    {
      cwd,
    }
  )

  if (pnpmWorkspaceFile) {
    return pnpmWorkspaceFile
  }

  return findUp.sync(
    [
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
      'bun.lock',
      'bun.lockb',
    ],
    {
      cwd,
    }
  )
}

export function findRootDirAndLockFiles(cwd: string): {
  lockFiles: string[]
  rootDir: string
} {
  const lockFile = findWorkRoot(cwd)
  if (!lockFile)
    return {
      lockFiles: [],
      rootDir: cwd,
    }

  const lockFiles = [lockFile]
  while (true) {
    const lastLockFile = lockFiles[lockFiles.length - 1]
    const currentDir = dirname(lastLockFile)
    const parentDir = dirname(currentDir)

    // dirname('/')==='/' so if we happen to reach the FS root (as might happen in a container we need to quit to avoid looping forever
    if (parentDir === currentDir) break

    const newLockFile = findWorkRoot(parentDir)

    if (!newLockFile) break

    lockFiles.push(newLockFile)
  }

  let rootDir = dirname(lockFiles[0])

  if (lockFiles.length > 1) {
    for (let i = lockFiles.length - 1; i >= 1; i--) {
      const candidateRootDir = dirname(lockFiles[i])
      if (isAppInWorkspace(candidateRootDir, dirname(lockFiles[0]))) {
        rootDir = candidateRootDir
        break
      }
    }
  }

  return {
    lockFiles,
    rootDir,
  }
}

export function warnDuplicatedLockFiles(lockFiles: string[], rootDir?: string) {
  if (lockFiles.length > 1) {
    const selectedLockFile =
      lockFiles.find((lockFile) => dirname(lockFile) === rootDir) ??
      lockFiles[lockFiles.length - 1]
    const additionalLockFiles = lockFiles
      .filter((lockFile) => lockFile !== selectedLockFile)
      .map((str) => `\n   * ${str}`)
      .join('')

    if (process.env.TURBOPACK) {
      Log.warnOnce(
        `Warning: Next.js inferred your workspace root, but it may not be correct.\n` +
          ` We detected multiple lockfiles and selected the directory of ${selectedLockFile} as the root directory.\n` +
          ` To silence this warning, set \`turbopack.root\` in your Next.js config, or consider ` +
          `removing one of the lockfiles if it's not needed.\n` +
          `   See https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory for more information.\n` +
          ` Detected additional lockfiles: ${additionalLockFiles}\n`
      )
    } else {
      Log.warnOnce(
        `Warning: Next.js inferred your workspace root, but it may not be correct.\n` +
          ` We detected multiple lockfiles and selected the directory of ${selectedLockFile} as the root directory.\n` +
          ` To silence this warning, set \`outputFileTracingRoot\` in your Next.js config, or consider ` +
          `removing one of the lockfiles if it's not needed.\n` +
          `   See https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats for more information.\n` +
          ` Detected additional lockfiles: ${additionalLockFiles}\n`
      )
    }
  }
}
