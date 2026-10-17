import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { join, resolve } from 'path'
import * as Log from '../../build/output/log'
import { Telemetry } from '../../telemetry/storage'
import { getAgentName } from '../../telemetry/agent-name'
import {
  eventAgentUpgradeCIInstallStarted,
  eventAgentUpgradeCIInstallResult,
  type AgentUpgradeCIInstallResult,
} from '../../telemetry/events/agent-upgrade'
import { getProjectDir } from '../get-project-dir'
import { getNpxCommand } from '../helpers/get-npx-command'
import loadConfig from '../../server/config'
import { normalizeConfig } from '../../server/config-shared'
import { interopDefault } from '../interop-default'
import { PHASE_PRODUCTION_BUILD } from '../../shared/lib/constants'
import { handoffUpgrade } from './harness'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function setupTelemetry(directory: string) {
  let distDir = '.next'
  try {
    const rawConfig = await loadConfig(PHASE_PRODUCTION_BUILD, directory, {
      rawConfig: true,
    })
    const config = await normalizeConfig(
      PHASE_PRODUCTION_BUILD,
      interopDefault(rawConfig)
    )
    if (typeof config.distDir === 'string') {
      distDir = config.distDir
    }
  } catch {
    // Installation and its result do not depend on evaluating the app config.
  }
  return new Telemetry({ distDir: join(directory, distDir), skipNotify: true })
}

export async function setupUpgradeCI({
  directory,
}: {
  directory: string | undefined
}) {
  const baseDir = resolve(directory || '.')
  const installId = randomUUID()
  const telemetry = await setupTelemetry(baseDir)
  telemetry.record(
    eventAgentUpgradeCIInstallStarted({
      installId,
      agentProduct: await getAgentName(),
    })
  )
  try {
    const appDirectory = getProjectDir(directory, false)
    Log.info('Preparing GitHub Actions setup...')
    const report = `${getNpxCommand(appDirectory)} next@${process.env.__NEXT_VERSION} internal report-upgrade-ci ${installId}`
    const instructions = await readFile(join(__dirname, 'setup-ci.md'), 'utf8')
    const result = await handoffUpgrade(
      {
        ci: ({ useWorktree, harness }) =>
          instructions
            .replaceAll('<app-directory>', () => JSON.stringify(appDirectory))
            .replaceAll('<installer-harness>', () => JSON.stringify(harness))
            .replaceAll('<report-command>', () => report)
            .replaceAll(
              '<worktree-choice>',
              useWorktree === false
                ? 'Use the current checkout.'
                : useWorktree === true
                  ? 'If this is a Git repository, install in a separate Git worktree. Otherwise install the files in place.'
                  : 'Follow the user’s worktree choice. If unspecified, use a separate Git worktree when Git is available; otherwise install the files in place.'
            ),
      },
      appDirectory,
      null,
      'ci'
    )
    if (result !== 'handed_off') {
      telemetry.record(
        eventAgentUpgradeCIInstallResult({
          installId,
          result: result === 'cancelled' ? 'cancelled' : 'failed',
          harness: null,
        })
      )
    }
  } catch (error) {
    telemetry.record(
      eventAgentUpgradeCIInstallResult({
        installId,
        result: 'failed',
        harness: null,
      })
    )
    throw error
  } finally {
    await telemetry.flush()
  }
}

export async function reportUpgradeCIResult({
  installId,
  result,
  harness,
}: {
  installId: string
  result: string
  harness: string
}) {
  if (
    !UUID_PATTERN.test(installId) ||
    !['pr_created', 'files_written', 'cancelled', 'failed', 'blocked'].includes(
      result
    ) ||
    !['codex', 'claude', 'none'].includes(harness)
  ) {
    throw new Error(
      'Expected an installation UUID, bounded installation result, and CI harness.'
    )
  }
  const telemetry = await setupTelemetry(process.cwd())
  await telemetry.record(
    eventAgentUpgradeCIInstallResult({
      installId,
      result: result as AgentUpgradeCIInstallResult,
      harness: harness === 'none' ? null : (harness as 'codex' | 'claude'),
    })
  )
  await telemetry.flush()
}
