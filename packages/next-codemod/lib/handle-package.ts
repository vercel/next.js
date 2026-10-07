import findUp from 'find-up'
import execa from 'execa'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export function getPkgManager(baseDir: string): PackageManager {
  try {
    // The app's declared manager takes precedence over the command launcher.
    const manifestPath = join(baseDir, 'package.json')
    if (existsSync(manifestPath)) {
      const { packageManager } = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const match =
        typeof packageManager === 'string'
          ? packageManager.match(/^(npm|pnpm|yarn|bun)@/)
          : null
      if (match) {
        return match[1] as PackageManager
      }
    }

    const userAgent = process.env.npm_config_user_agent
    if (userAgent) {
      if (userAgent.startsWith('yarn')) {
        return 'yarn'
      } else if (userAgent.startsWith('pnpm')) {
        return 'pnpm'
      } else if (userAgent.startsWith('bun')) {
        return 'bun'
      } else if (userAgent.startsWith('npm')) {
        return 'npm'
      }
    }
    const lockFile = findUp.sync(
      [
        'yarn.lock',
        'pnpm-lock.yaml',
        'bun.lock',
        'bun.lockb',
        'package-lock.json',
      ],
      { cwd: baseDir }
    )
    if (lockFile) {
      switch (basename(lockFile)) {
        case 'yarn.lock':
          return 'yarn'
        case 'pnpm-lock.yaml':
          return 'pnpm'
        case 'bun.lock':
        case 'bun.lockb':
          return 'bun'
        case 'package-lock.json':
          return 'npm'
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
