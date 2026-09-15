import { spawn } from 'child_process'
import { cp, mkdtemp, rm } from 'fs/promises'
import { constants as osConstants, tmpdir } from 'os'
import { join } from 'path'
import spawnCanary from 'next/dist/compiled/cross-spawn'
import createSpinner from '../build/spinner'
import * as Log from '../build/output/log'
import { findDir } from '../lib/find-pages-dir'
import { getProjectDir } from '../lib/get-project-dir'
import { getNpxCommand } from '../lib/helpers/get-npx-command'
import { dim } from '../lib/picocolors'

type NextUpgradeOptions = {
  revision: string | undefined
  verbose: boolean
  ai: boolean | string
  experimentalAgenticDryRun: boolean
}

export async function spawnNextUpgrade(
  directory: string | undefined,
  options: NextUpgradeOptions
) {
  const baseDir = getProjectDir(directory)

  if (options.ai) {
    try {
      // Local development and evals run the invoked build directly. The canary
      // child uses the same flag to avoid recursion. Consume it before handoff
      // so later agent commands use the normal canary delegation again.
      const useLocalBuild = process.env.__NEXT_UPGRADE_LOCAL === '1'
      delete process.env.__NEXT_UPGRADE_LOCAL

      if (!useLocalBuild) {
        Log.info(dim('Starting the latest Next.js canary upgrade CLI'))
        const [command, ...runnerArgs] = getNpxCommand(baseDir).split(' ')
        const args = [
          ...runnerArgs,
          'next@canary',
          'upgrade',
          baseDir,
          `${
            options.experimentalAgenticDryRun
              ? '--experimental-agentic-dry-run'
              : '--ai'
          }${typeof options.ai === 'string' ? `=${options.ai}` : ''}`,
        ]

        if (options.verbose) {
          args.push('--verbose')
        }

        // The package runner owns installation; the canary owns assessment,
        // bundled guides and handoff, regardless of the app's installed version.
        process.exitCode = await new Promise<number>((resolve, reject) => {
          const child = spawnCanary(command, args, {
            cwd: baseDir,
            stdio: 'inherit',
            env: { ...process.env, __NEXT_UPGRADE_LOCAL: '1' },
          })
          const onInterrupt = () => child.kill('SIGINT')
          const onTerminate = () => child.kill('SIGTERM')
          process.on('SIGINT', onInterrupt)
          process.on('SIGTERM', onTerminate)

          const cleanup = () => {
            process.removeListener('SIGINT', onInterrupt)
            process.removeListener('SIGTERM', onTerminate)
          }

          child.once('error', (error: Error) => {
            cleanup()
            reject(error)
          })
          child.once(
            'close',
            (code: number | null, signal: NodeJS.Signals | null) => {
              cleanup()
              resolve(
                code ?? (signal ? 128 + (osConstants.signals[signal] ?? 1) : 1)
              )
            }
          )
        })
        return
      }

      // A workspace root must not launch an upgrade for an unspecified app.
      if (!findDir(baseDir, 'app') && !findDir(baseDir, 'pages')) {
        throw new Error(
          'No Next.js app found in this directory. Run the command from an app directory or pass its path.'
        )
      }

      const targetRequest =
        typeof options.ai === 'string' ? options.ai : 'security'

      // Resolve the requested target before preparing an agent session.
      const { prepareUpgrade } =
        require('../lib/upgrade/prepare-upgrade') as typeof import('../lib/upgrade/prepare-upgrade')
      const assessmentSpinner = createSpinner('Preparing upgrade')
      const result = await prepareUpgrade(baseDir, targetRequest).finally(() =>
        assessmentSpinner?.stop()
      )

      if (result.status !== 'ready') {
        Log.info(`[next upgrade: ${result.status}] ${result.reason}`)
        return
      }

      Log.info(
        `Upgrade: Next.js ${result.installedVersion} → ${result.targetVersion}`
      )

      // Use the invoking CLI's guides, even when the app runs an older Next.js.
      // Retain them outside the app so dependency changes cannot remove them.
      const bundledDocs = join(__dirname, '../docs')
      const runDirectory = await mkdtemp(join(tmpdir(), 'next-upgrade-'))
      const guidesSpinner = createSpinner('Preparing upgrade guides')

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

      const references =
        result.references.length === 1
          ? `Reference: ${result.references[0]}`
          : `References: ${JSON.stringify(result.references)}`

      // TODO: Once every eligible security target supports
      // `experimental.agenticAutoUpgrade`, ask the agent to enable it after
      // verification so future upgrade reminders can use the same policy.

      // Pass resolved inputs directly; the agent owns repairs and verification.
      const prompt = `Upgrade ${JSON.stringify(baseDir)} from Next.js ${result.installedVersion} to ${result.targetVersion}.
Upgrade type: ${targetRequest}.
${references}
Read and follow ${JSON.stringify(join(runDirectory, 'docs/01-app/02-guides/upgrading/agentic-upgrade.md'))} before making changes.
Preserve existing permissions.${
        options.experimentalAgenticDryRun
          ? '\nThis is a --experimental-agentic-dry-run: complete the migration and verification, create local commits, then stop. Do not push or create a PR/MR.'
          : ''
      }`

      const { handoffUpgrade } =
        require('../lib/upgrade/harness') as typeof import('../lib/upgrade/harness')
      await handoffUpgrade(prompt, baseDir)
    } catch (error) {
      Log.error(
        '[next upgrade: blocked]',
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
    ...(options.revision ? [options.revision] : []),
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
