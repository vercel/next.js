import fs from 'fs'
import path from 'path'
import execa from 'execa'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export function getPkgManager(baseDir: string): PackageManager {
  try {
    for (const { lockFile, packageManager } of [
      { lockFile: 'yarn.lock', packageManager: 'yarn' },
      { lockFile: 'pnpm-lock.yaml', packageManager: 'pnpm' },
      { lockFile: 'package-lock.json', packageManager: 'npm' },
      { lockFile: 'bun.lockb', packageManager: 'bun' },
    ]) {
      if (fs.existsSync(path.join(baseDir, lockFile))) {
        return packageManager as PackageManager
      }
    }
    const userAgent = process.env.npm_config_user_agent
    if (userAgent) {
      if (userAgent.startsWith('yarn')) {
        return 'yarn'
      } else if (userAgent.startsWith('pnpm')) {
        return 'pnpm'
      }
    }
    try {
      execa.sync('yarn --version', { stdio: 'ignore' })
      return 'yarn'
    } catch {
      try {
        execa.sync('pnpm --version', { stdio: 'ignore' })
        return 'pnpm'
      } catch {
        execa.sync('bun --version', { stdio: 'ignore' })
        return 'bun'
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

  execa.sync(pkgManager, [command, packageToUninstall], { stdio: 'inherit' })
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
