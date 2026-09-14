import { spawn } from 'child_process'
import { cp, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { findDir } from '../lib/find-pages-dir'
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
  const baseDir = getProjectDir(directory)

  if (options.experimentalAgent) {
    try {
      // A workspace root must not launch an upgrade for an unspecified app.
      if (!findDir(baseDir, 'app') && !findDir(baseDir, 'pages')) {
        throw new Error(
          'No Next.js app found in this directory. Run the command from an app directory or pass its path.'
        )
      }

      // Use the invoking CLI's guides, even when the app runs an older Next.js.
      // Retain them outside the app so dependency changes cannot remove them.
      const bundledDocs = join(__dirname, '../docs')
      const runDirectory = await mkdtemp(join(tmpdir(), 'next-upgrade-'))

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
      }

      // The agent assesses eligibility and performs the upgrade from these instructions.
      const prompt = `Assess a security upgrade for the app in ${JSON.stringify(baseDir)}.
Read and follow ${JSON.stringify(join(runDirectory, 'docs/01-app/02-guides/upgrading/security-upgrade.md'))} before making changes.
The run directory contains the workflow instructions and bundled migration guides.
${
  options.revision
    ? `The suggested target is ${JSON.stringify(options.revision)}; check it against the security policy. `
    : ''
}Preserve your existing permissions.${
        options.experimentalAgentDryRun
          ? ' This is a --experimental-agent-dry-run: complete the migration and verification, create local commits, then stop. Do not push or create a PR/MR.'
          : ''
      }`

      const { handoffUpgrade } =
        require('../lib/upgrade/harness') as typeof import('../lib/upgrade/harness')
      await handoffUpgrade(prompt, baseDir)
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
