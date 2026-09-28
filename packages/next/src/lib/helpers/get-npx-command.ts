import { execSync } from 'child_process'
import { getPkgManager } from './get-pkg-manager'
import type { AgeGatedPackageManager } from './get-minimum-release-age'

export function getNpxCommand(
  baseDir: string,
  pkgManager: AgeGatedPackageManager = getPkgManager(baseDir)
) {
  let command = 'npx --yes'
  if (pkgManager === 'pnpm') {
    command = 'pnpm --loglevel=error dlx'
  } else if (pkgManager === 'yarn') {
    try {
      execSync('yarn dlx --help', { stdio: 'ignore' })
      command = 'yarn --quiet dlx'
    } catch {}
  } else if (pkgManager === 'bun') {
    command = 'bunx'
  }

  return command
}
