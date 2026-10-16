import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { getPkgManager } from './get-pkg-manager'

export function getNpxCommand(
  baseDir: string,
  options?: { preferFresh: boolean }
) {
  // Bun support is scoped to the bootstrap; other callers keep their runner.
  if (options?.preferFresh) {
    const userAgent = process.env.npm_config_user_agent
    const hasOtherManager =
      /^(npm|pnpm|yarn)\//.test(userAgent || '') ||
      ['yarn.lock', 'pnpm-lock.yaml', 'package-lock.json'].some((file) =>
        existsSync(join(baseDir, file))
      )
    if (
      userAgent?.startsWith('bun/') ||
      (!hasOtherManager &&
        ['bun.lock', 'bun.lockb'].some((file) =>
          existsSync(join(baseDir, file))
        ))
    ) {
      return 'bunx'
    }
  }

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

  if (options?.preferFresh) {
    if (command.startsWith('pnpm ')) {
      return 'pnpm --loglevel=error --config.prefer-offline=false --config.dlx-cache-max-age=0 dlx'
    }
    if (command.startsWith('npx ')) {
      return 'npx --yes --prefer-offline=false'
    }
  }

  return command
}
