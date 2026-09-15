import { spawn } from 'child_process'
import { cp, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import * as Log from '../build/output/log'
import createSpinner from '../build/spinner'
import { findDir } from '../lib/find-pages-dir'
import { getProjectDir } from '../lib/get-project-dir'
import { getNpxCommand } from '../lib/helpers/get-npx-command'
import { dim } from '../lib/picocolors'
import { runChildProcess } from '../lib/upgrade/run-child-process'

type NextUpgradeOptions = {
  revision: string
  verbose: boolean
  ai: boolean | string | undefined
}

export async function spawnNextUpgrade(
  directory: string | undefined,
  options: NextUpgradeOptions
) {
  const baseDir = getProjectDir(directory)

  if (options.ai) {
    try {
      // A delegated canary uses itself. Local runs and evals use their invoked build.
      const useCurrentCli = process.env.__NEXT_UPGRADE_USE_CURRENT_CLI === '1'
      delete process.env.__NEXT_UPGRADE_USE_CURRENT_CLI

      if (!useCurrentCli) {
        Log.info(dim('Preparing upgrade...'))
        const [command, ...runnerArgs] = getNpxCommand(baseDir).split(' ')
        const aiArgument =
          typeof options.ai === 'string' ? `--ai=${options.ai}` : '--ai'
        const args = [
          ...runnerArgs,
          'next@canary',
          'upgrade',
          baseDir,
          aiArgument,
        ]

        if (options.verbose) {
          args.push('--verbose')
        }

        process.exitCode = await runChildProcess(command, args, {
          cwd: baseDir,
          stdio: 'inherit',
          env: { ...process.env, __NEXT_UPGRADE_USE_CURRENT_CLI: '1' },
        })
        return
      }

      // A workspace root must not launch an upgrade for an unspecified app.
      if (!findDir(baseDir, 'app') && !findDir(baseDir, 'pages')) {
        throw new Error(
          'No Next.js app found in this directory. Run the command from an app directory or pass its path.'
        )
      }

      // TODO: Once `agenticAutoUpgrade` can be read without validating a
      // legacy app's config against the current Next.js version, use it for
      // bare `--ai` before falling back to security.
      const upgradeType =
        typeof options.ai === 'string' ? options.ai : 'security'

      if (upgradeType !== 'security') {
        throw new Error(
          `Unsupported AI upgrade type ${JSON.stringify(upgradeType)}. Expected "security".`
        )
      }

      // Resolve the requested target before preparing an agent session.
      const { prepareUpgrade } =
        require('../lib/upgrade/prepare-upgrade') as typeof import('../lib/upgrade/prepare-upgrade')
      const assessmentSpinner = createSpinner('Checking for security updates')
      const result = await prepareUpgrade(baseDir).finally(() =>
        assessmentSpinner?.stop()
      )

      if (result.status !== 'ready') {
        Log.info(result.reason)
        return
      }

      Log.info(
        `Security update: Next.js ${result.installedVersion} → ${result.targetVersion}`
      )

      // Use the invoking CLI's guides, even when the app runs an older Next.js.
      // Retain them outside the app so dependency changes cannot remove them.
      const bundledDocs = join(__dirname, '../docs')
      const runDirectory = await mkdtemp(join(tmpdir(), 'next-upgrade-'))
      const guidesSpinner = createSpinner('Preparing upgrade')

      try {
        for (const router of ['01-app', '02-pages']) {
          await cp(
            join(bundledDocs, router, '02-guides/upgrading'),
            join(runDirectory, 'docs', router, '02-guides/upgrading'),
            { recursive: true }
          )
        }
      } catch (error) {
        await rm(runDirectory, { recursive: true, force: true })
        throw error
      } finally {
        guidesSpinner?.stop()
      }

      // TODO: Once every eligible security target supports
      // `experimental.agenticAutoUpgrade`, ask the agent to enable it after
      // verification so future upgrade reminders can use the same policy.

      const references = result.references
        .map((reference) => `- ${reference}`)
        .join('\n')

      // Pass resolved inputs directly; the agent owns repairs and verification.
      const prompt = `Upgrade type: ${upgradeType}

Upgrade the app in ${JSON.stringify(baseDir)} from Next.js ${result.installedVersion} to ${result.targetVersion}.

Read and follow ${JSON.stringify(join(runDirectory, 'docs/01-app/02-guides/upgrading/agentic-upgrade.md'))} before making changes.

References:
${references}

Preserve existing permissions.`

      Log.bootstrap(prompt)
    } catch (error) {
      Log.error(
        'Could not prepare the security upgrade:',
        error instanceof Error ? error.message : error
      )
      process.exitCode = 1
    }

    return
  }

  const [upgradeProcessCommand, ...upgradeProcessDefaultArgs] =
    getNpxCommand(baseDir).split(' ')

  const upgradeProcessCommandArgs = [
    ...upgradeProcessDefaultArgs,
    // Needs to be bleeding edge (canary) to pick up latest codemods.
    '@next/codemod@canary',
    'upgrade',
    options.revision,
  ]

  if (options.verbose) {
    upgradeProcessCommandArgs.push('--verbose')
  }

  const upgradeProcess = spawn(
    upgradeProcessCommand,
    upgradeProcessCommandArgs,
    {
      stdio: 'inherit',
      cwd: baseDir,
    }
  )

  upgradeProcess.on('close', (code) => {
    process.exitCode = code ?? 0
  })
}
