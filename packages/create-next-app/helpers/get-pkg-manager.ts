import { execSync } from 'child_process'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export function getPkgManager(): PackageManager {
  const userAgent = process.env.npm_config_user_agent || ''

  if (userAgent.startsWith('yarn')) {
    return 'yarn'
  }

  if (userAgent.startsWith('pnpm')) {
    return 'pnpm'
  }

  if (userAgent.startsWith('bun')) {
    return 'bun'
  }

  return 'npm'
}

/**
 * Get the full version string for the given package manager.
 * Returns null if unable to determine the version.
 *
 * First tries to parse from npm_config_user_agent (e.g., "pnpm/9.13.2 npm/? ..."),
 * then falls back to spawning `<packageManager> --version`.
 */
export function getPackageManagerVersion(
  packageManager: PackageManager
): string | null {
  const userAgent = process.env.npm_config_user_agent || ''
  const userAgentMatch = userAgent.match(
    new RegExp(`${packageManager}/([\\d.]+[\\w.-]*)`)
  )
  if (userAgentMatch) {
    return userAgentMatch[1]
  }

  try {
    const version = execSync(`${packageManager} --version`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
    if (/^\d+\.\d+\.\d+/.test(version)) {
      return version
    }
  } catch {
    // package manager not available or failed to run
  }

  return null
}

/**
 * Get the major version of pnpm being used.
 * Returns null if unable to determine the version.
 */
export function getPnpmMajorVersion(): number | null {
  const version = getPackageManagerVersion('pnpm')
  if (!version) return null
  const major = parseInt(version.split('.')[0], 10)
  return Number.isNaN(major) ? null : major
}
