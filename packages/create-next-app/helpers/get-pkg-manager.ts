export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'deno'
declare global {
  // Declare Deno if it doesn't exist
  var Deno: { [key: string]: any } | undefined
}

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
  if (typeof globalThis.Deno !== 'undefined') {
    return 'deno'
  }

  return 'npm'
}
