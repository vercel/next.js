import { execSync } from 'child_process'

export type PackageManager = 'npm' | 'pnpm' | 'yarn'

export function getPkgManager(): PackageManager {
  try {
    const userAgent = process.env.npm_config_user_agent

    if (userAgent) {
      if (userAgent.startsWith('yarn')) {
        execSync('yarn --version', { stdio: 'ignore' })
        return 'yarn'
      } else if (userAgent.startsWith('pnpm')) {
        execSync('pnpm --version', { stdio: 'ignore' })
        return 'pnpm'
      } else {
        return 'npm'
      }
    } else {
      return 'npm'
    }
  } catch {
    return 'npm'
  }
}
