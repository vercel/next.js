import fs from 'fs'
import path from 'path'
import execa from 'execa'

export type PackageManager = 'npm' | 'pnpm' | 'yarn'

function getPkgManager(baseDir: string): PackageManager {
  for (const { lockFile, packageManager } of [
    { lockFile: 'yarn.lock', packageManager: 'yarn' },
    { lockFile: 'pnpm-lock.yaml', packageManager: 'pnpm' },
    { lockFile: 'package-lock.json', packageManager: 'npm' },
  ]) {
    if (fs.existsSync(path.join(baseDir, lockFile))) {
      return packageManager as PackageManager
    }
  }
}

export function uninstallPackage(packageToUninstall: string) {
  const pkgManager = getPkgManager(process.cwd())
  if (!pkgManager) throw new Error('Failed to find package manager')

  let command = 'uninstall'
  if (pkgManager === 'yarn') {
    command = 'remove'
  }

  execa.sync(pkgManager, [command, packageToUninstall], { stdio: 'inherit' })
}

export function installPackage(packageToInstall: string) {
  const pkgManager = getPkgManager(process.cwd())
  if (!pkgManager) throw new Error('Failed to find package manager')

  try {
    execa.sync(pkgManager, ['add', packageToInstall], { stdio: 'inherit' })
  } catch (error) {
    throw new Error(
      `Failed to install "${packageToInstall}". Please install it manually.`,
      { cause: error }
    )
  }
}
