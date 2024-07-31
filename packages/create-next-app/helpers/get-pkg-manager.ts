import { existsSync } from 'fs'
import { join } from 'path'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export function getPkgManager(baseDir: string): PackageManager {
  const userAgent = process.env.npm_config_user_agent
  if (userAgent) {
    if (userAgent.startsWith('yarn')) {
      return 'yarn'
    }
    if (userAgent.startsWith('pnpm')) {
      return 'pnpm'
    }
    if (userAgent.startsWith('bun')) {
      return 'bun'
    }
  }

  for (const { lockFile, packageManager } of [
    { lockFile: 'package-lock.json', packageManager: 'npm' },
    { lockFile: 'yarn.lock', packageManager: 'yarn' },
    { lockFile: 'pnpm-lock.yaml', packageManager: 'pnpm' },
    { lockFile: 'bun.lock', packageManager: 'bun' },
  ] as const) {
    if (existsSync(join(baseDir, lockFile))) {
      return packageManager
    }
  }

  return 'npm'
}
