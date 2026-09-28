import { execSync } from 'child_process'
import { getPkgManager, type PackageManager } from './get-pkg-manager'

export function getNpxCommand(
  baseDir: string,
  pkgManager: PackageManager | 'bun' = getPkgManager(baseDir)
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
