export type PackageManager = 'npm' | 'pnpm' | 'yarn'

export function getPkgManager(): PackageManager {
  const userAgent = process.env.npm_config_user_agent

  if (userAgent && userAgent.startsWith('yarn')) {
    return 'yarn'
  }
  
  if (userAgent && userAgent.startsWith('pnpm')) {
    return 'pnpm'
  } 
  
  return 'npm'
}
