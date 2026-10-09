import { join } from 'path'
import { loadAgentUpgradeConfig } from '../next/config'
import { createTelemetry } from '../next/telemetry'
import { eventAgentUpgradeAgentResult } from '../next/telemetry'

export async function reportAgentUpgradeAgentResult(
  runId: string,
  result: string
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      runId
    ) ||
    (result !== 'success' && result !== 'failure')
  ) {
    throw new Error(
      'Expected an upgrade run UUID and a success or failure result.'
    )
  }
  const directory = process.cwd()
  const config = await loadAgentUpgradeConfig(directory)
  const telemetry = createTelemetry(
    directory,
    join(directory, config.distDir || '.next')
  )
  await telemetry.record(eventAgentUpgradeAgentResult({ runId, result }))
  await telemetry.flush()
}
