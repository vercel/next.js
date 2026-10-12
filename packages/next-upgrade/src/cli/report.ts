import { join } from 'path'
import * as Log from 'next/dist/build/output/log'
import { getInstalledNextVersion } from '../next/project'
import { UUID_PATTERN } from './run'

export async function reportAgentUpgradeAgentResult(
  runId: string,
  result: string,
  loadConfig: (directory: string) => Promise<{ distDir: string | undefined }>,
  createTelemetry: (distDir: string) => {
    recordAgentResult(fields: {
      runId: string
      result: 'success' | 'failure'
      resultVersion: string | null
    }): Promise<unknown>
    flush(): Promise<unknown>
  }
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
  const config = await loadConfig(process.cwd())
  const telemetry = createTelemetry(
    join(process.cwd(), config.distDir || '.next')
  )

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

  await telemetry.recordAgentResult({ runId, result, resultVersion })
  await telemetry.flush()
}
