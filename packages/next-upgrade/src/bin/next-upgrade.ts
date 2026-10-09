#!/usr/bin/env node
import { Command, Option } from 'commander'
import { spawnNextUpgrade } from '../cli/run'
import { reportAgentUpgradeAgentResult } from '../cli/report'
import { upgradeVersion } from '../version'

const program = new Command().name('next-upgrade').version(upgradeVersion)
// Agent upgrades preserve the caller's environment for config and dev checks.
// Manual upgrades and internal commands retain Next's production default.
program.hook('preAction', (command) => {
  if (!command.getOptionValue('agent')) {
    process.env.NODE_ENV = process.env.NODE_ENV || 'production'
  }
})
program
  .description('Upgrade a Next.js app, optionally with an agent.')
  .argument(
    '[directory]',
    'The app directory. Defaults to the current directory.'
  )
  .option(
    '--revision <revision>',
    'Target Next.js version or npm dist tag.',
    upgradeVersion.includes('-canary.') ? 'canary' : 'latest'
  )
  .option('--verbose', 'Verbose output', false)
  .addOption(
    new Option(
      '--agent [type]',
      'Upgrade with an agent: security, latest, or experimental-future.'
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
    await spawnNextUpgrade(
      directory,
      options,
      options.internalNudgeId !== undefined
        ? {
            id: options.internalNudgeId,
            recipient: options.internalNudgeRecipient,
          }
        : null
    )
  })
program
  .command('internal', { hidden: true })
  .command('report-agent-upgrade <run-id> <result>')
  .action(reportAgentUpgradeAgentResult)
program.parseAsync().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
