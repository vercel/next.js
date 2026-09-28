import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import findUp from 'next/dist/compiled/find-up'

export type PackageManager = 'npm' | 'pnpm' | 'yarn'

export function getPkgManager(baseDir: string): PackageManager
export function getPkgManager(
  baseDir: string,
  mode: 'upgrade'
): PackageManager | 'bun'
export function getPkgManager(
  baseDir: string,
  mode?: 'upgrade'
): PackageManager | 'bun' {
  if (mode === 'upgrade') {
    const marker = findUp.sync(
      (directory) => {
        const packageJsonPath = path.join(directory, 'package.json')
        if (fs.existsSync(packageJsonPath)) {
          const manifest = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf8')
          ) as { packageManager: string | undefined }
          if (/^(npm|pnpm|yarn|bun)@/.test(manifest.packageManager ?? '')) {
            return packageJsonPath
          }
        }
        for (const lockfile of [
          'bun.lock',
          'bun.lockb',
          'pnpm-lock.yaml',
          'yarn.lock',
          'package-lock.json',
        ]) {
          const lockfilePath = path.join(directory, lockfile)
          if (fs.existsSync(lockfilePath)) {
            return lockfilePath
          }
        }
        return undefined
      },
      { cwd: baseDir }
    )
    if (marker) {
      const packageJsonPath = path.join(path.dirname(marker), 'package.json')
      if (marker === packageJsonPath) {
        const manifest = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf8')
        ) as { packageManager: string }
        return manifest.packageManager.split('@')[0] as PackageManager | 'bun'
      }
      const lockfile = path.basename(marker)
      if (lockfile === 'bun.lock' || lockfile === 'bun.lockb') {
        return 'bun'
      }
      if (lockfile === 'pnpm-lock.yaml') {
        return 'pnpm'
      }
      if (lockfile === 'yarn.lock') {
        return 'yarn'
      }
      return 'npm'
    }
  }

  try {
    const userAgent = process.env.npm_config_user_agent
    if (userAgent) {
      if (userAgent.startsWith('yarn')) {
        return 'yarn'
      } else if (userAgent.startsWith('pnpm')) {
        return 'pnpm'
      } else if (userAgent.startsWith('npm')) {
        return 'npm'
      } else if (mode === 'upgrade' && userAgent.startsWith('bun/')) {
        return 'bun'
      }
    }
    for (const { lockFile, packageManager } of [
      ...(mode === 'upgrade'
        ? [
            { lockFile: 'bun.lock', packageManager: 'bun' },
            { lockFile: 'bun.lockb', packageManager: 'bun' },
          ]
        : []),
      { lockFile: 'yarn.lock', packageManager: 'yarn' },
      { lockFile: 'pnpm-lock.yaml', packageManager: 'pnpm' },
      { lockFile: 'package-lock.json', packageManager: 'npm' },
    ]) {
      if (fs.existsSync(path.join(baseDir, lockFile))) {
        return packageManager as PackageManager | 'bun'
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
