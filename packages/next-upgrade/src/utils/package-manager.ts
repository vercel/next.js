import execa from 'execa'
import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { basename, dirname, join } from 'path'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

/**
 * Get the full version string for the given package manager.
 *
 * First runs `<packageManager> --version` from `cwd`, so a version selected by
 * the target app's `packageManager` is used even when the upgrade was
 * launched from another directory. Falls back to `npm_config_user_agent`
 * (e.g., "pnpm/9.13.2 npm/? ...").
 *
 * Returns null if unable to determine the version.
 */
export function getPackageManagerVersion(
  packageManager: PackageManager,
  cwd: string
): string | null {
  try {
    const version = execSync(`${packageManager} --version`, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
    if (/^\d+\.\d+\.\d+/.test(version)) {
      return version
    }
  } catch {
    // package manager not available or failed to run
  }

  const userAgent = process.env.npm_config_user_agent || ''
  const userAgentMatch = userAgent.match(
    new RegExp(`${packageManager}/([\\d.]+[\\w.-]*)`)
  )
  return userAgentMatch?.[1] ?? null
}

/**
 * Get the major version of pnpm being used for the app at `cwd`.
 * Returns null if unable to determine the version.
 */
export function getPnpmMajorVersion(cwd: string): number | null {
  const version = getPackageManagerVersion('pnpm', cwd)
  if (!version) return null
  const major = parseInt(version.split('.')[0], 10)
  return Number.isNaN(major) ? null : major
}

const LOCK_FILES = [
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
]

// The nearest lock file in the directory or one of its parents.
function findLockFile(directory: string): string | null {
  let current = directory
  while (true) {
    for (const lockFile of LOCK_FILES) {
      const candidate = join(current, lockFile)
      if (existsSync(candidate)) {
        return candidate
      }
    }
    const parent = dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

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
    const lockFile = findLockFile(baseDir)
    if (lockFile) {
      switch (basename(lockFile)) {
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

export function runInstallation(
  packageManager: PackageManager,
  options: { cwd: string }
) {
  try {
    execa.sync(packageManager, ['install'], {
      cwd: options.cwd,
      env: {
        ...process.env,
        // In case NODE_ENV=production is set, we still want dev dependencies to
        // be installed. Otherwise we won't be able to check for peer dependencies.
        // --production=false is not implemented by every package manager.
        NODE_ENV: 'development',
      },
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
