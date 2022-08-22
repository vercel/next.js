import { execSync } from 'child_process'

export type PackageManager = 'npm' | 'pnpm' | 'yarn'

export function getPkgManager(): PackageManager {
  try {
    const userAgent = process.env.npm_config_user_agent
    if (userAgent) {
      if (userAgent.startsWith('yarn')) {
        return 'yarn'
      } else if (userAgent.startsWith('pnpm')) {
        return 'pnpm'
      }
    }
    try {
      execSync('yarn --version', { stdio: 'ignore' })
      return 'yarn'
    } catch {
      execSync('pnpm --version', { stdio: 'ignore' })
      return 'pnpm'
    }
  } catch {
    return 'npm'
  }
}
