import { execSync } from 'child_process'
import { getPkgManager } from './get-pkg-manager'

export function getNpxCommand(baseDir: string) {
  const pkgManager = getPkgManager(baseDir)
  let command = 'npx --yes'
  if (pkgManager === 'pnpm') {
    command = 'pnpm --silent dlx'
  } else if (pkgManager === 'yarn') {
    try {
      execSync('yarn dlx --help', { stdio: 'ignore' })
      command = 'yarn --quiet dlx'
    } catch {}
  }

  return command
}
