import findUp from 'find-up'
import execa from 'execa'
import { basename } from 'node:path'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export function getPkgManager(baseDir: string): PackageManager {
  try {
    const lockFile = findUp.sync(
      [
        'package-lock.json',
        'yarn.lock',
        'pnpm-lock.yaml',
        'bun.lock',
        'bun.lockb',
      ],
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
        case 'bun.lock':
        case 'bun.lockb':
          return 'bun'
        default:
          return 'npm'
      }
    }
    // No lock file found, default to npm
    return 'npm'
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
    execa.sync(pkgManager, [command, packageToUninstall], {
      stdio: 'inherit',
      shell: true,
    })
  } catch (error) {
    throw new Error(
      `Failed to uninstall "${packageToUninstall}". Please uninstall it manually.`,
      { cause: error }
    )
  }
}

const ADD_CMD_FLAG = {
  npm: 'install',
  yarn: 'add',
  pnpm: 'add',
  bun: 'add',
}

const DEV_DEP_FLAG = {
  npm: '--save-dev',
  yarn: '--dev',
  pnpm: '--save-dev',
  bun: '--dev',
}

export function installPackages(
  packageToInstall: string[],
  options: {
    packageManager?: PackageManager
    silent?: boolean
    dev?: boolean
  } = {}
) {
  if (packageToInstall.length === 0) return

  const {
    packageManager = getPkgManager(process.cwd()),
    silent = false,
    dev = false,
  } = options

  if (!packageManager) throw new Error('Failed to find package manager')

  const addCmd = ADD_CMD_FLAG[packageManager]
  const devDepFlag = dev ? DEV_DEP_FLAG[packageManager] : undefined

  const installFlags = [addCmd]
  if (devDepFlag) {
    installFlags.push(devDepFlag)
  }
  try {
    execa.sync(packageManager, [...installFlags, ...packageToInstall], {
      // Keeping stderr since it'll likely be relevant later when it fails.
      stdio: silent ? ['ignore', 'ignore', 'inherit'] : 'inherit',
      shell: true,
    })
  } catch (error) {
    throw new Error(
      `Failed to install "${packageToInstall}". Please install it manually.`,
      { cause: error }
    )
  }
}

export function runInstallation(
  packageManager: PackageManager,
  options: { cwd: string }
) {
  try {
    execa.sync(packageManager, ['install'], {
      cwd: options.cwd,
      stdio: 'inherit',
      shell: true,
    })
  } catch (error) {
    throw new Error('Failed to install dependencies', { cause: error })
  }
}

export function addPackageDependency(
  packageJson: Record<string, any>,
  name: string,
  version: string,
  dev: boolean
): void {
  if (dev) {
    packageJson.devDependencies = packageJson.devDependencies || {}
  } else {
    packageJson.dependencies = packageJson.dependencies || {}
  }

  const deps = dev ? packageJson.devDependencies : packageJson.dependencies

  deps[name] = version
}
