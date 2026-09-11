import { spawn } from 'child_process'
import { getProjectDir } from '../lib/get-project-dir'
import { getNpxCommand } from '../lib/helpers/get-npx-command'

type NextUpgradeOptions = {
  revision: string | undefined
  verbose: boolean
  experimentalAgent: boolean
  experimentalAgentDryRun: boolean
}

export async function spawnNextUpgrade(
  directory: string | undefined,
  options: NextUpgradeOptions
) {
  if (options.experimentalAgentDryRun && !options.experimentalAgent) {
    console.error(
      '[next upgrade: blocked] --experimental-agent-dry-run requires --experimental-agent.'
    )
    process.exitCode = 1
    return
  }

  const baseDir = getProjectDir(directory)

  if (options.experimentalAgent) {
    try {
      const { resolveUpgrade } =
        require('../lib/upgrade/resolve') as typeof import('../lib/upgrade/resolve')
      const result = await resolveUpgrade({
        directory: baseDir,
        revision: options.revision,
      })

      if (result.status !== 'ready') {
        console.log(`[next upgrade: ${result.status}] ${result.reason}`)

        if (result.status === 'blocked') {
          process.exitCode = 1
        }

        return
      }

      // Only ready upgrades reach the agent. Retain the resolved inputs and
      // guides first; the agent owns repository preflight, edits and verification.
      const { prepareUpgradeResources } =
        require('../lib/upgrade/resources') as typeof import('../lib/upgrade/resources')
      const prompt = await prepareUpgradeResources(
        result,
        options.experimentalAgentDryRun
      )

      const { handoffUpgrade } =
        require('../lib/upgrade/harness') as typeof import('../lib/upgrade/harness')
      await handoffUpgrade(prompt, baseDir, {
        current: result.app.nextVersion,
        target: result.targetVersion,
      })
    } catch (error) {
      console.error(
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
