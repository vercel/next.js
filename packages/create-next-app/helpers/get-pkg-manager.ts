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
 * Get the major version of pnpm being used.
 * Returns null if unable to determine the version.
 *
 * First tries to parse from npm_config_user_agent (e.g., "pnpm/9.13.2 npm/? ..."),
 * then falls back to spawning `pnpm --version --silent`.
 */
export function getPnpmMajorVersion(): number | null {
  // Try to get version from user agent first (e.g., "pnpm/9.13.2 npm/? node/v20.x linux x64")
  const userAgent = process.env.npm_config_user_agent || ''
  const pnpmVersionMatch = userAgent.match(/pnpm\/(\d+)/)
  if (pnpmVersionMatch) {
    return parseInt(pnpmVersionMatch[1], 10)
  }

  // Fall back to spawning pnpm --version
  try {
    const version = execSync('pnpm --version --silent', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
    const majorVersion = parseInt(version.split('.')[0], 10)
    if (!Number.isNaN(majorVersion)) {
      return majorVersion
    }
  } catch {
    // pnpm not available or failed to run
  }

  return null
}
