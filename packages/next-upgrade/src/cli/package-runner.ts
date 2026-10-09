import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

export type PackageManager = 'npm' | 'pnpm' | 'yarn'

export function getPkgManager(baseDir: string): PackageManager {
  try {
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

export function getNpxCommand(baseDir: string) {
  const pkgManager = getPkgManager(baseDir)
  let command = 'npx --yes'
  if (pkgManager === 'pnpm') {
    command = 'pnpm --loglevel=error dlx'
  } else if (pkgManager === 'yarn') {
    try {
      execSync('yarn dlx --help', { stdio: 'ignore' })
      command = 'yarn --quiet dlx'
    } catch {}
  }

  return command
}

// Codemods are versioned independently of the upgrade tool and the target app.
export async function resolveCodemodVersion(): Promise<string> {
  const response = await fetch(
    'https://registry.npmjs.org/@next%2fcodemod/canary',
    {
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
      redirect: 'error',
    }
  )
  if (!response.ok) {
    throw new Error(
      `Could not fetch the @next/codemod canary: HTTP ${response.status}`
    )
  }
  const { version } = await response.json()
  const { valid } = await import('semver')
  if (typeof version !== 'string' || valid(version) !== version) {
    throw new Error('Could not determine the @next/codemod version.')
  }
  return version
}
