import { Command, Option } from 'commander'
import { upgradeVersion } from './utils/env'
import { italic } from './utils/picocolors'

// Match the release channel of this package, like `next upgrade` matches the
// channel of the running Next.js.
function getDefaultRevision(version: string) {
  return version.includes('-canary.')
    ? 'canary'
    : version.includes('-rc.')
      ? 'rc'
      : version.includes('-beta.')
        ? 'beta'
        : 'latest'
}

export async function runCli(argv: string[]): Promise<void> {
  const program = new Command('next-upgrade')
    .description(
      'Upgrade Next.js apps to desired versions with a single command.'
    )
    .version(
      upgradeVersion,
      '-v, --version',
      'Output the current version of @next/upgrade.'
    )
    .helpOption('-h, --help', 'Display this help message.')
    .argument(
      '[directory]',
      `A Next.js project directory to upgrade. ${italic(
        'If no directory is provided, the current directory will be used.'
      )}`
    )
    .usage('[directory] [options]')
    // Options after `report` belong to it, not to the upgrade command.
    .enablePositionalOptions()
    .option(
      '--revision <revision>',
      'Specify the target Next.js version using an upgrade type ("patch", "minor", "major"), an NPM dist tag (e.g. "latest", "canary", "rc", "beta") or an exact version number (e.g. "15.0.0").',
      getDefaultRevision(upgradeVersion)
    )
    .option('--verbose', 'Verbose output', false)
    .option(
      '-y, --yes',
      'Skip every interactive prompt and accept its default. Also auto-enabled when stdin is not a TTY (e.g. running under an agent or in CI).',
      false
    )
    .option(
      '--skip-adoption',
      'Skip optional feature-adoption codemods while applying version migrations.',
      false
    )
    .option(
      '--skip-react-upgrade',
      'Keep React dependencies, types, and overrides unchanged and skip React codemods.',
      false
    )
    .option(
      '--skip-eslint-upgrade',
      'Keep ESLint dependencies unchanged and skip the next-lint-to-eslint-cli codemod.',
      false
    )
    .addOption(
      new Option(
        '--agent [type]',
        'Upgrade with an agent to security, latest, or experimental-future. Defaults to security.'
      ).conflicts('revision')
    )
    // Keep nudge attribution available to agents without exposing it in public help.
    .addOption(new Option('--internal-nudge-id <id>').hideHelp())
    .action(async (directory: string | undefined, options) => {
      const { spawnNextUpgrade } =
        require('./agent-upgrade') as typeof import('./agent-upgrade')
      await spawnNextUpgrade(
        directory,
        options,
        options.internalNudgeId !== undefined
          ? { id: options.internalNudgeId, recipient: 'agent' }
          : null
      )
    })

  // Agents report completion with the CLI that prepared the upgrade, even
  // after the upgrade has changed the app's dependencies.
  program
    .command('report', { hidden: true })
    .argument('<run-id>', 'The upgrade run UUID.')
    .argument('<result>', 'The agent-reported success or failure result.')
    .action(async (runId: string, result: string) => {
      const { reportAgentUpgradeAgentResult } =
        require('./agent-upgrade') as typeof import('./agent-upgrade')
      await reportAgentUpgradeAgentResult(runId, result)
    })

  await program.parseAsync(argv)
}
