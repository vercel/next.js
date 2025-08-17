import { dirname } from 'path'
import findUp from 'next/dist/compiled/find-up'
import * as Log from '../build/output/log'

export function findRootLockFile(cwd: string) {
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

export function findRootDir(cwd: string): string {
  const lockFile = findRootLockFile(cwd)
  if (!lockFile) return cwd

  const lockFiles = [lockFile]
  while (true) {
    const lastLockFile = lockFiles[lockFiles.length - 1]
    const currentDir = dirname(lastLockFile)
    const parentDir = dirname(currentDir)

    // dirname('/')==='/' so if we happen to reach the FS root (as might happen in a container we need to quit to avoid looping forever
    if (parentDir === currentDir) break

    const newLockFile = findRootLockFile(parentDir)

    if (!newLockFile) break

    lockFiles.push(newLockFile)
  }

  // Only warn if not in a build worker to avoid duplicate warnings
  if (typeof process.send !== 'function' && lockFiles.length > 1) {
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

  return dirname(lockFiles[lockFiles.length - 1])
}
