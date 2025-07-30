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

export function findRootDir(cwd: string) {
  const lockFile = findRootLockFile(cwd)
  if (!lockFile) return undefined

  const lockFiles = [lockFile]
  while (true) {
    const nextDir = dirname(dirname(lockFiles[lockFiles.length - 1]))
    const newLockFile = findRootLockFile(nextDir)

    if (newLockFile) {
      lockFiles.push(newLockFile)
    } else {
      break
    }
  }

  // Only warn if not in a build worker to avoid duplicate warnings
  if (typeof process.send !== 'function' && lockFiles.length > 1) {
    const additionalLockFiles = lockFiles
      .slice(0, -1)
      .map((str) => '\n   * ' + str)
      .join('')

    Log.warnOnce(
      `Warning: Next.js inferred your workspace root, but it may not be correct.\n` +
        ` We detected multiple lockfiles and selected ${lockFiles[lockFiles.length - 1]} as the root directory.\n` +
        ` To silence this warning, set turbopack.root in your Next.js config, or consider ` +
        `removing one of the lockfiles if it's not needed.\n` +
        `   See https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory for more information.\n` +
        ` Detected additional lockfiles: ${additionalLockFiles}\n`
    )
  }

  return dirname(lockFile)
}
