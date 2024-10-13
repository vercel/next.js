import findUp from 'find-up'
import execa from 'execa'
import { basename } from 'node:path'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export function getPkgManager(baseDir: string): PackageManager {
  try {
    const lockFile = findUp.sync(
      ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'],
      { cwd: baseDir }
    )
    if (lockFile) {
      switch (basename(lockFile)) {
        case 'package-lock.json':
          return 'npm'
        case 'yarn.lock':
          return 'yarn'
        case 'pnpm-lock.yaml':
          return 'pnpm'
        case 'bun.lockb':
          return 'bun'
        default:
          return 'npm'
      }
    }
  } catch {
    return 'npm'
  }
}

export function uninstallPackage(
  packageToUninstall: string,
  pkgManager?: PackageManager
) {
  pkgManager ??= getPkgManager(process.cwd())
  if (!pkgManager) throw new Error('Failed to find package manager')

  let command = 'uninstall'
  if (pkgManager === 'yarn') {
    command = 'remove'
  }

  try {
    execa.sync(pkgManager, [command, packageToUninstall], { stdio: 'inherit' })
  } catch (error) {
    throw new Error(
      `Failed to uninstall "${packageToUninstall}". Please uninstall it manually.`,
      { cause: error }
    )
  }
}

export function installPackages(
  packageToInstall: string[],
  options: { packageManager?: PackageManager; silent?: boolean } = {}
) {
  const { packageManager = getPkgManager(process.cwd()), silent = false } =
    options

  if (!packageManager) throw new Error('Failed to find package manager')

  try {
    execa.sync(packageManager, ['add', ...packageToInstall], {
      // Keeping stderr since it'll likely be relevant later when it fails.
      stdio: silent ? ['ignore', 'ignore', 'inherit'] : 'inherit',
    })
  } catch (error) {
    throw new Error(
      `Failed to install "${packageToInstall}". Please install it manually.`,
      { cause: error }
    )
  }
}
