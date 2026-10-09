import { updateInitialEnv } from '@next/env'
import spawn from 'next/dist/compiled/cross-spawn'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import { constants } from 'os'
import { join, resolve } from 'path'
import { valid } from 'next/dist/compiled/semver'
import * as Log from '../build/output/log'
import { getNpxCommand } from '../lib/helpers/get-npx-command'
import { getProjectDir } from '../lib/get-project-dir'
import { warnMissingReactDependencies } from '../lib/warn-missing-react-dependencies'
import { getAgentName } from '../telemetry/agent-name'
import type { AgentUpgradePolicy } from '../telemetry/events/agent-upgrade'
import {
  eventAgentUpgradeCLIResult,
  eventAgentUpgradeRunStarted,
} from '../telemetry/events/agent-upgrade'
import { Telemetry } from '../telemetry/storage'
import loadConfig from '../server/config'
import { normalizeConfig } from '../server/config-shared'
import { interopDefault } from '../lib/interop-default'
import { PHASE_PRODUCTION_BUILD } from '../shared/lib/constants'

type NextUpgradeOptions = {
  revision: string
  verbose: boolean
  agent: boolean | string | undefined
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function runUpgradeCommand(
  directory: string,
  args: string[],
  version: string,
  runId: string | null,
  config: string | null
) {
  const [command, ...runnerArgs] = getNpxCommand(directory).split(' ')
  const child = spawn(
    command,
    [...runnerArgs, `@next/upgrade@${version}`, ...args],
    {
      cwd: existsSync(directory) ? directory : process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        // Keep config/environment/consent on the invoking Next graph.
        __NEXT_UPGRADE_NEXT_PATH: resolve(__dirname, '../..'),
        ...(runId === null
          ? {}
          : {
              __NEXT_AGENT_UPGRADE_RUN_ID: runId,
              __NEXT_UPGRADE_EXPECTED_CLI_VERSION: version,
              ...(config === null ? {} : { __NEXT_UPGRADE_CONFIG: config }),
            }),
      },
    }
  )
  const onInterrupt = () => child.kill('SIGINT')
  const onTerminate = () => child.kill('SIGTERM')
  const onHangup = () => child.kill('SIGHUP')
  process.on('SIGINT', onInterrupt)
  process.on('SIGTERM', onTerminate)
  process.on('SIGHUP', onHangup)
  try {
    process.exitCode = await new Promise<number>((resolveCode, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) =>
        resolveCode(
          code ?? (signal ? 128 + (constants.signals[signal] ?? 1) : 1)
        )
      )
    })
  } finally {
    process.removeListener('SIGINT', onInterrupt)
    process.removeListener('SIGTERM', onTerminate)
    process.removeListener('SIGHUP', onHangup)
  }
}

async function resolveCanaryVersion(): Promise<string> {
  try {
    const response = await fetch(
      'https://registry.npmjs.org/@next/upgrade/canary',
      {
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
        redirect: 'error',
      }
    )
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const { version } = await response.json()
    if (typeof version !== 'string' || valid(version) !== version) {
      throw new Error('Invalid canary version')
    }
    return version
  } catch (error) {
    throw new Error(
      'Could not fetch the latest @next/upgrade canary from npm.',
      {
        cause: error,
      }
    )
  }
}

// Preserve the Next command while bootstrapping only the standalone upgrade tool.
export async function spawnNextUpgrade(
  directory: string | undefined,
  options: NextUpgradeOptions,
  nudgeSource: { id: string; recipient: 'human' | 'agent' } | null
) {
  let baseDir = options.agent
    ? resolve(directory || '.')
    : getProjectDir(directory)
  const args = [baseDir]
  if (options.agent) {
    args.push(
      typeof options.agent === 'string' ? `--agent=${options.agent}` : '--agent'
    )
  } else {
    args.push('--revision', options.revision)
  }
  if (options.verbose) {
    args.push('--verbose')
  }
  if (nudgeSource) {
    args.push(
      '--internal-nudge-id',
      nudgeSource.id,
      '--internal-nudge-recipient',
      nudgeSource.recipient
    )
  }
  if (!options.agent) {
    await runUpgradeCommand(baseDir, args, 'canary', null, null)
    return
  }

  // Bootstrap remains part of the original invocation, before the package runs.
  // Keep config failures until after recording its start, just as before extraction.
  let distDir = '.next'
  let configuredPolicy: unknown = null
  let configError: unknown = null
  try {
    baseDir = getProjectDir(directory, false)
    warnMissingReactDependencies(baseDir)
    const raw = await loadConfig(PHASE_PRODUCTION_BUILD, baseDir, {
      rawConfig: true,
    })
    const config = await normalizeConfig(
      PHASE_PRODUCTION_BUILD,
      interopDefault(raw)
    )
    distDir = config.distDir || '.next'
    configuredPolicy = config.experimental?.agentUpgrade
    args[0] = baseDir
  } catch (error) {
    configError = error
  }
  const telemetry = new Telemetry({
    distDir: join(baseDir, distDir),
    skipNotify: true,
  })
  const inheritedRunId = process.env.__NEXT_AGENT_UPGRADE_RUN_ID
  delete process.env.__NEXT_AGENT_UPGRADE_RUN_ID
  const invalidRunId =
    inheritedRunId !== undefined && !UUID_PATTERN.test(inheritedRunId)
  const invalidNudgeId =
    nudgeSource !== null && !UUID_PATTERN.test(nudgeSource.id)
  const runId = inheritedRunId && !invalidRunId ? inheritedRunId : randomUUID()
  let failureStage: 'cli' | 'metadata' = 'cli'
  try {
    if (!inheritedRunId || invalidRunId) {
      const agentProduct = await getAgentName()
      const nudge = invalidRunId || invalidNudgeId ? null : nudgeSource
      const origin = nudge
        ? nudge.recipient === 'agent'
          ? 'agent_nudge'
          : 'human_nudge'
        : agentProduct
          ? 'agent_manual'
          : 'human_manual'
      telemetry.record(
        eventAgentUpgradeRunStarted({
          runId,
          nudgeId: nudge?.id ?? null,
          origin,
          agentProduct,
          requestedPolicy:
            options.agent === 'security' ||
            options.agent === 'latest' ||
            options.agent === 'experimental-future'
              ? options.agent
              : null,
        })
      )
    }
    if (invalidRunId) {
      throw new Error('Invalid upgrade run ID.')
    }
    if (invalidNudgeId) {
      throw new Error('Invalid upgrade nudge ID.')
    }
    if (configError) {
      throw configError
    }
    const expectedVersion = process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
    delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
    delete process.env.__NEXT_UPGRADE_USE_CURRENT_CLI
    if (
      expectedVersion !== undefined &&
      process.env.__NEXT_VERSION !== expectedVersion
    ) {
      throw new Error(
        `Expected Next.js ${expectedVersion} for the upgrade, but launched ${process.env.__NEXT_VERSION}.`
      )
    }
    failureStage = 'metadata'
    const version = expectedVersion ?? (await resolveCanaryVersion())
    failureStage = 'cli'
    // The original same-canary path evaluated config once. Reuse only the fields
    // the agent CLI consumes; Future Defaults still load their own phase config.
    const config =
      process.env.__NEXT_VERSION === version
        ? JSON.stringify({
            distDir,
            experimental: {
              agentUpgrade:
                typeof configuredPolicy === 'string' ? configuredPolicy : null,
            },
          })
        : null
    await runUpgradeCommand(baseDir, args, version, runId, config)
  } catch (error) {
    telemetry.record(
      eventAgentUpgradeCLIResult({
        runId,
        result:
          failureStage === 'metadata' ? 'metadata_failure' : 'cli_failure',
        resolvedPolicy: null,
        handoffMethod: null,
        selectedAgentProduct: null,
      })
    )
    Log.error(
      'Could not prepare the upgrade:',
      error instanceof Error ? error.message : error
    )
    process.exitCode = 1
  } finally {
    await telemetry.flush()
  }
}

export async function reportAgentUpgradeAgentResult(
  runId: string,
  result: string
) {
  await runUpgradeCommand(
    process.cwd(),
    ['internal', 'report-agent-upgrade', runId, result],
    'canary',
    null,
    null
  )
}

export async function runUpgrade(
  directory: string,
  policy: AgentUpgradePolicy,
  nudgeId: string | null
) {
  // The agent's dev/build commands must not repeat the parent's explicit request.
  delete process.env.__NEXT_AGENT_UPGRADE
  updateInitialEnv({ __NEXT_AGENT_UPGRADE: undefined })
  await spawnNextUpgrade(
    directory,
    { revision: 'latest', verbose: false, agent: policy },
    nudgeId ? { id: nudgeId, recipient: 'human' } : null
  )
  return process.exitCode ?? 0
}
