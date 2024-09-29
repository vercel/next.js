import findUp from 'find-up'
import execa from 'execa'
import { basename } from 'path'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'
const lockFiles = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
]

export async function getPkgManager(baseDir: string): Promise<PackageManager> {
  try {
    const lockFile = await findUp(lockFiles, { cwd: baseDir })
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

export async function uninstallPackage(
  packageToUninstall: string,
  pkgManager?: PackageManager
) {
  pkgManager ??= await getPkgManager(process.cwd())
  if (!pkgManager) throw new Error('Failed to find package manager')

  let command = 'uninstall'
  if (pkgManager === 'yarn') {
    command = 'remove'
  }

  execa.sync(pkgManager, [command, packageToUninstall], { stdio: 'inherit' })
}

export async function installPackage(
  packageToInstall: string | string[],
  pkgManager?: PackageManager,
  cwd?: string
) {
  pkgManager ??= await getPkgManager(cwd ?? process.cwd())
  if (!pkgManager) throw new Error('Failed to find package manager')

  if (typeof packageToInstall === 'string') {
    packageToInstall = [packageToInstall]
  }

  const args = ['add', ...packageToInstall]

  try {
    execa.sync(pkgManager, args, { stdio: 'inherit' })
  } catch (error) {
    throw new Error(
      `Failed to install "${packageToInstall}". Please install it manually.`,
      { cause: error }
    )
  }
}
