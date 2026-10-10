import { Command, Option } from 'commander'
import { spawnCodemodUpgrade } from './run'
import { runNextCommand } from '../next/command'
import { getProjectDir, warnMissingReactDependencies } from '../next/project'
import { upgradeVersion } from '../version'

// CLI parsing is separate from the library import used inside Next's process.
export async function runCLI() {
  const program = new Command().name('next-upgrade').version(upgradeVersion)
  program
    .description('Upgrade a Next.js app, optionally with an agent.')
    .argument(
      '[directory]',
      'The app directory. Defaults to the current directory.'
    )
    .option(
      '--revision <revision>',
      'Target Next.js version or npm dist tag.',
      upgradeVersion.includes('-canary.')
        ? 'canary'
        : upgradeVersion.includes('-rc.')
          ? 'rc'
          : upgradeVersion.includes('-beta.')
            ? 'beta'
            : 'latest'
    )
    .option('--verbose', 'Verbose output', false)
    .addOption(
      new Option(
        '--agent [type]',
        'Upgrade with an agent to security, latest, or experimental-future. Defaults to security.'
      ).conflicts('revision')
    )
    .addOption(new Option('--internal-nudge-id <id>').hideHelp())
    .addOption(
      new Option('--internal-nudge-recipient <recipient>')
        .choices(['human', 'agent'])
        .default('agent')
        .hideHelp()
    )
    .action(async (directory, options) => {
      // The invoking Next supplies integrations independently of the app's dependencies.
      if (options.agent) {
        const baseDir = getProjectDir(directory)
        const args = [
          'upgrade',
          baseDir,
          typeof options.agent === 'string'
            ? `--agent=${options.agent}`
            : '--agent',
        ]
        if (options.verbose) {
          args.push('--verbose')
        }
        if (options.internalNudgeId !== undefined) {
          args.push(
            '--internal-nudge-id',
            options.internalNudgeId,
            '--internal-nudge-recipient',
            options.internalNudgeRecipient
          )
        }
        process.exitCode = await runNextCommand(baseDir, args)
        return
      }

      // Agent-run dev/build commands retain the caller's environment, as next upgrade does.
      if (!process.env.NODE_ENV) {
        process.env.NODE_ENV = 'production'
      }
      spawnCodemodUpgrade(directory, options, {
        getProjectDir,
        warnMissingReactDependencies,
      })
    })
  program
    .command('internal', { hidden: true })
    .command('report-agent-upgrade <run-id> <result>')
    .action(async (runId: string, result: string) => {
      if (!process.env.NODE_ENV) {
        process.env.NODE_ENV = 'production'
      }
      process.exitCode = await runNextCommand(process.cwd(), [
        'internal',
        'report-agent-upgrade',
        runId,
        result,
      ])
    })
  await program.parseAsync()
}
