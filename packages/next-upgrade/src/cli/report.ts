import { join } from 'path'
import * as Log from 'next/dist/build/output/log'
import { eventAgentUpgradeAgentResult } from 'next/dist/telemetry/events/agent-upgrade'
import { Telemetry } from 'next/dist/telemetry/storage'
import { loadAgentUpgradeConfig } from '../next/config'
import { getInstalledNextVersion } from '../next/project'
import { UUID_PATTERN } from './run'

export async function reportAgentUpgradeAgentResult(
  runId: string,
  result: string
) {
  // Only accept the bounded result and run ID; project details never enter this event.
  if (
    !UUID_PATTERN.test(runId) ||
    (result !== 'success' && result !== 'failure')
  ) {
    throw new Error(
      'Expected an upgrade run UUID and a success or failure result.'
    )
  }

  // Reuse normal telemetry consent and delivery without starting another upgrade.
  const config = await loadAgentUpgradeConfig(process.cwd())
  const telemetry = new Telemetry({
    distDir: join(process.cwd(), config.distDir || '.next'),
    skipNotify: true,
  })

  // Read the upgraded app instead of the pinned reporting CLI; missing dependencies still report a result.
  let resultVersion: string | null = null
  try {
    resultVersion = await getInstalledNextVersion(process.cwd())
  } catch (error) {
    Log.warn(
      'Could not determine the app version for upgrade telemetry:',
      error instanceof Error ? error.message : error
    )
  }

  await telemetry.record(
    eventAgentUpgradeAgentResult({ runId, result, resultVersion })
  )
  await telemetry.flush()
}
