import { dirname } from 'path'
import findUp from 'next/dist/compiled/find-up'

function findRootLockFile(cwd: string) {
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

export function findRootDir(cwd: string) {
  const lockFile = findRootLockFile(cwd)
  return lockFile ? dirname(lockFile) : undefined
}
