import { execSync } from 'child_process'
import { constants as osConstants } from 'os'
import execa from 'execa'
import { getPkgManager } from '../lib/handle-package'

const packageJson = require('../package.json')

function getNpxCommand(cwd: string): string {
  const packageManager = getPkgManager(cwd)
  if (packageManager === 'pnpm') {
    return 'pnpm --silent dlx'
  }
  if (packageManager === 'yarn') {
    try {
      execSync('yarn dlx --help', { stdio: 'ignore', cwd })
      return 'yarn --quiet dlx'
    } catch {}
  }
  if (packageManager === 'bun') {
    return 'bunx'
  }
  return 'npx --yes'
}

/**
 * `@next/codemod upgrade` moved to `@next/upgrade`. Keep the command working
 * by running the matching `@next/upgrade` release with the same options.
 */
export async function runUpgrade(
  revision: string | undefined,
  options: {
    verbose: boolean
    yes?: boolean
    skipAdoption?: boolean
    skipReactUpgrade?: boolean
    skipEslintUpgrade?: boolean
  }
): Promise<void> {
  const cwd = process.cwd()
  const [command, ...runnerArgs] = getNpxCommand(cwd).split(' ')
  const args = [
    ...runnerArgs,
    `@next/upgrade@${packageJson.version}`,
    // `@next/codemod upgrade` defaulted to the latest minor release.
    '--revision',
    revision ?? 'minor',
  ]
  if (options.verbose) args.push('--verbose')
  if (options.yes) args.push('--yes')
  if (options.skipAdoption) args.push('--skip-adoption')
  if (options.skipReactUpgrade) args.push('--skip-react-upgrade')
  if (options.skipEslintUpgrade) args.push('--skip-eslint-upgrade')

  const result = await execa(command, args, {
    cwd,
    stdio: 'inherit',
    reject: false,
  })
  process.exitCode =
    result.exitCode ??
    (result.signal ? 128 + (osConstants.signals[result.signal] ?? 1) : 1)
}
