import { Command, Option } from 'commander'
import { join } from 'path'
import { spawnNextUpgrade } from './run'
import { reportAgentUpgradeAgentResult } from './report'
import { prepareUpgrade } from './agent/prepare'
import { getAgentName } from './agent/detect-agent'
import { loadAgentUpgradeConfig, loadFutureConfig } from '../next/config'
import { createTelemetry } from '../next/telemetry'
import {
  findDir,
  getProjectDir,
  warnMissingReactDependencies,
} from '../next/project'
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
      // Agent-run dev/build commands retain the caller's environment, as next upgrade does.
      if (!options.agent && !process.env.NODE_ENV) {
        process.env.NODE_ENV = 'production'
      }
      await spawnNextUpgrade(
        directory,
        options,
        options.internalNudgeId !== undefined
          ? {
              id: options.internalNudgeId,
              recipient: options.internalNudgeRecipient,
            }
          : null,
        {
          getProjectDir,
          findDir,
          warnMissingReactDependencies,
          cliPackage: '@next/upgrade',
          cliVersion: upgradeVersion,
          bundledDocs: join(__dirname, 'docs'),
          bundledGuides: join(__dirname, 'guides'),
          async loadConfig(dir) {
            const config = await loadAgentUpgradeConfig(dir)
            return {
              distDir: config.distDir,
              configuredPolicy: config.experimental?.agentUpgrade,
            }
          },
          prepareUpgrade(dir, policy) {
            return prepareUpgrade(dir, policy, loadFutureConfig, findDir)
          },
          getAgentName,
          createTelemetry(distDir) {
            return createTelemetry(getProjectDir(directory), distDir)
          },
        }
      )
    })
  program
    .command('internal', { hidden: true })
    .command('report-agent-upgrade <run-id> <result>')
    .action(async (runId: string, result: string) => {
      if (!process.env.NODE_ENV) {
        process.env.NODE_ENV = 'production'
      }
      await reportAgentUpgradeAgentResult(
        runId,
        result,
        loadAgentUpgradeConfig,
        (distDir) => createTelemetry(process.cwd(), distDir)
      )
    })
  await program.parseAsync()
}
