import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

// Package-runner detection used by the agent upgrade flow. It matches the
// detection `next upgrade` used before it moved into this package, except that
// an app's declared package manager wins over the command that launched it.
function getRunnerPackageManager(baseDir: string): 'npm' | 'pnpm' | 'yarn' {
  try {
    const manifestPath = path.join(baseDir, 'package.json')
    if (fs.existsSync(manifestPath)) {
      const { packageManager } = JSON.parse(
        fs.readFileSync(manifestPath, 'utf8')
      )
      const match =
        typeof packageManager === 'string'
          ? packageManager.match(/^(npm|pnpm|yarn)@/)
          : null
      if (match) {
        return match[1] as 'npm' | 'pnpm' | 'yarn'
      }
    }

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
    ] as const) {
      if (fs.existsSync(path.join(baseDir, lockFile))) {
        return packageManager
      }
    }
    try {
      execSync('yarn --version', { cwd: baseDir, stdio: 'ignore' })
      return 'yarn'
    } catch {
      execSync('pnpm --version', { cwd: baseDir, stdio: 'ignore' })
      return 'pnpm'
    }
  } catch {
    return 'npm'
  }
}

export function getNpxCommand(baseDir: string) {
  const pkgManager = getRunnerPackageManager(baseDir)
  let command = 'npx --yes'
  if (pkgManager === 'pnpm') {
    command = 'pnpm --loglevel=error dlx'
  } else if (pkgManager === 'yarn') {
    try {
      execSync('yarn dlx --help', { cwd: baseDir, stdio: 'ignore' })
      command = 'yarn --quiet dlx'
    } catch {}
  }

  return command
}
