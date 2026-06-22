import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import * as Log from '../build/output/log'

const lockFileNames = [
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
]

function findUpFile(
  fileNames: string[],
  cwd: string,
  isCandidate = (_file: string) => true
) {
  let currentDir = cwd

  while (true) {
    for (const fileName of fileNames) {
      const file = join(currentDir, fileName)
      if (existsSync(file) && isCandidate(file)) {
        return file
      }
    }

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) {
      return undefined
    }
    currentDir = parentDir
  }
}

function hasPackageJson(dir: string) {
  return existsSync(join(dir, 'package.json'))
}

function hasWorkspacePackageJson(dir: string) {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    const workspaces = pkg?.workspaces
    return Array.isArray(workspaces)
      ? workspaces.length > 0
      : Array.isArray(workspaces?.packages) && workspaces.packages.length > 0
  } catch {
    return false
  }
}

function isLockFile(file: string) {
  return lockFileNames.some((fileName) => file.endsWith(fileName))
}

function findWorkRoot(cwd: string, requireWorkspaceRoot = false) {
  // pnpm-workspace.yaml is an explicit workspace root marker and should win
  // before nested lockfiles are considered.
  const pnpmWorkspaceFile = findUpFile(['pnpm-workspace.yaml'], cwd)

  if (pnpmWorkspaceFile) {
    return pnpmWorkspaceFile
  }

  return findUpFile(lockFileNames, cwd, (file) => {
    if (!isLockFile(file) || !hasPackageJson(dirname(file))) {
      return false
    }

    return !requireWorkspaceRoot || hasWorkspacePackageJson(dirname(file))
  })
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

    const newLockFile = findWorkRoot(parentDir, true)

    if (!newLockFile) break

    lockFiles.push(newLockFile)
  }

  return {
    lockFiles,
    rootDir: dirname(lockFiles[lockFiles.length - 1]),
  }
}

export function warnDuplicatedLockFiles(lockFiles: string[]) {
  if (lockFiles.length > 1) {
    const additionalLockFiles = lockFiles
      .slice(0, -1)
      .map((str) => `\n   * ${str}`)
      .join('')

    if (process.env.TURBOPACK) {
      Log.warnOnce(
        `Warning: Next.js inferred your workspace root, but it may not be correct.\n` +
          ` We detected multiple lockfiles and selected the directory of ${lockFiles[lockFiles.length - 1]} as the root directory.\n` +
          ` To silence this warning, set \`turbopack.root\` in your Next.js config, or consider ` +
          `removing one of the lockfiles if it's not needed.\n` +
          `   See https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory for more information.\n` +
          ` Detected additional lockfiles: ${additionalLockFiles}\n`
      )
    } else {
      Log.warnOnce(
        `Warning: Next.js inferred your workspace root, but it may not be correct.\n` +
          ` We detected multiple lockfiles and selected the directory of ${lockFiles[lockFiles.length - 1]} as the root directory.\n` +
          ` To silence this warning, set \`outputFileTracingRoot\` in your Next.js config, or consider ` +
          `removing one of the lockfiles if it's not needed.\n` +
          `   See https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats for more information.\n` +
          ` Detected additional lockfiles: ${additionalLockFiles}\n`
      )
    }
  }
}
