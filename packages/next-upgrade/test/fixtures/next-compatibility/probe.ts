import { createRequire } from 'module'
import { join } from 'path'
import {
  loadAgentUpgradeConfig,
  loadFutureConfig,
} from '../../../src/next/config'
import { createTelemetry } from '../../../src/next/telemetry'
import { reportAgentUpgradeAgentResult } from '../../../src/cli/report'

async function main() {
  const directory = process.cwd()
  const appRequire = createRequire(join(directory, 'package.json'))
  const nextRequire = createRequire(
    appRequire.resolve('next/dist/server/config')
  )
  const raw = await loadAgentUpgradeConfig(directory)
  const loadedEnvironment = process.env.NEXT_UPGRADE_COMPAT_VALUE
  const future = await loadFutureConfig(directory)
  const restoredEnvironment =
    process.env.NEXT_UPGRADE_COMPAT_VALUE === undefined
  await reportAgentUpgradeAgentResult(
    'acfdca44-4753-4022-9cc5-afdc19d6f56e',
    'success'
  )
  const telemetry = createTelemetry(
    directory,
    join(directory, raw.distDir || '.next')
  )
  process.stdout.write(
    `UPGRADE_COMPAT_RESULT=${JSON.stringify({
      version: appRequire('next/package.json').version,
      environmentVersion: nextRequire('@next/env/package.json').version,
      distDir: raw.distDir,
      rawPolicy: raw.experimental?.agentUpgrade,
      futureDistDir: future.distDir,
      loadedEnvironment,
      restoredEnvironment,
      consent: Reflect.get(telemetry, 'isEnabled'),
      recorded: await telemetry.record({
        eventName: 'NEXT_AGENT_UPGRADE_COMPATIBILITY',
        payload: {},
      }),
    })}\n`
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
