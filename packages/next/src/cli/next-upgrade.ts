import { spawn } from 'child_process'
import { getProjectDir } from '../lib/get-project-dir'
import { getNpxCommand } from '../lib/helpers/get-npx-command'

interface NextUpgradeOptions {
  revision: string
  verbose: boolean
  agent?: boolean
  dryRun?: boolean
  revisionExplicit?: boolean
}

export async function spawnNextUpgrade(
  directory: string | undefined,
  options: NextUpgradeOptions
) {
  if (options.dryRun && !options.agent) {
    console.error('[next upgrade: blocked] --dry-run requires --agent.')
    process.exitCode = 1
    return
  }
  const baseDir = getProjectDir(directory)
  if (options.agent) {
    try {
      const { resolveUpgrade } =
        require('../lib/upgrade/resolve') as typeof import('../lib/upgrade/resolve')
      const result = await resolveUpgrade({
        directory: baseDir,
        revision: options.revisionExplicit ? options.revision : undefined,
      })
      if (result.status !== 'ready') {
        console.log(`[next upgrade: ${result.status}] ${result.reason}`)
        if (result.status === 'blocked') process.exitCode = 1
        return
      }
      const { prepareUpgradeResources } =
        require('../lib/upgrade/resources') as typeof import('../lib/upgrade/resources')
      const { handoffUpgrade } =
        require('../lib/upgrade/harness') as typeof import('../lib/upgrade/harness')
      const packet = await prepareUpgradeResources(result, {
        dryRun: options.dryRun,
      })
      await handoffUpgrade(packet.prompt, baseDir, {
        current: result.app.nextVersion,
        target: result.target.nextVersion,
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
