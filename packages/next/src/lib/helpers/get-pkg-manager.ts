import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export type PackageManager = 'npm' | 'pnpm' | 'yarn'

// Metadata collection must not launch package managers just to identify them.
export function detectPkgManager(baseDir: string): PackageManager | null {
  const userAgent = process.env.npm_config_user_agent
  if (userAgent) {
    if (userAgent.startsWith('yarn')) {
      return 'yarn'
    } else if (userAgent.startsWith('pnpm')) {
      return 'pnpm'
    } else if (userAgent.startsWith('npm')) {
      return 'npm'
    }
  }
  for (const { lockFile, packageManager } of [
    { lockFile: 'yarn.lock', packageManager: 'yarn' },
    { lockFile: 'pnpm-lock.yaml', packageManager: 'pnpm' },
    { lockFile: 'package-lock.json', packageManager: 'npm' },
  ]) {
    if (fs.existsSync(path.join(baseDir, lockFile))) {
      return packageManager as PackageManager
    }
  }
  return null
}

export function getPkgManager(baseDir: string): PackageManager {
  try {
    const detected = detectPkgManager(baseDir)
    if (detected) {
      return detected
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
