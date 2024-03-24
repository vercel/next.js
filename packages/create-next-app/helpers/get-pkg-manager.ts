export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export function getPkgManager(): PackageManager {
  const userAgent = process.env.npm_config_user_agent || ''

  if (userAgent.startsWith('yarn')) {
    return 'yarn'
  } else if (userAgent.startsWith('pnpm')) {
    return 'pnpm'
  } else if (userAgent.startsWith('bun')) {
    return 'bun'
  } else return 'npm'
}
