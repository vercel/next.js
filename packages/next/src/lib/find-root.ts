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
    Log.warnOnce(
      `Warning: Found multiple lockfiles. Consider removing the lockfiles at ${lockFiles
        .slice(0, lockFiles.length - 1)
        .map((str) => '\n   * ' + str)
        .join('')}\n`
    )
  }

  return dirname(lockFile)
}
