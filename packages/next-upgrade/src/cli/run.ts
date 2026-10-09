import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { join, resolve as resolvePath } from 'path'
import * as Log from '../shared/log'
import createSpinner from './spinner'
import { findDir } from '../next/project'
import { getProjectDir } from '../next/project'
import { getNpxCommand } from './package-runner'
import { warnMissingReactDependencies } from '../next/project'
import { getAgentName } from './agent/detect-agent'
import {
  eventAgentUpgradeCLIResult,
  eventAgentUpgradeRunStarted,
  type AgentUpgradeCLIResult,
  type AgentUpgradeHandoffMethod,
  type AgentUpgradePolicy,
} from '../next/telemetry'
import { prepareUpgradeGuides } from './agent/guides'
import { loadAgentUpgradeConfig } from '../next/config'
import { createTelemetry } from '../next/telemetry'
import { upgradeVersion } from '../version'

type NextUpgradeOptions = {
  revision: string
  verbose: boolean
  agent: boolean | string | undefined
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function spawnNextUpgrade(
  directory: string | undefined,
  options: NextUpgradeOptions,
  nudgeSource: { id: string; recipient: 'human' | 'agent' } | null
) {
  let baseDir = resolvePath(directory || '.')

  if (options.agent) {
    // Match dev/build's telemetry storage, including custom output directories in CI.
    // Retain config errors until after recording the invocation so failed runs still count.
    let distDir = '.next'
    let configuredPolicy: unknown = null
    let configError: unknown = null
    try {
      baseDir = getProjectDir(directory, false)
      warnMissingReactDependencies(baseDir)
      const config = await loadAgentUpgradeConfig(baseDir)
      distDir = config.distDir || '.next'
      configuredPolicy = config.experimental?.agentUpgrade
    } catch (error) {
      configError = error
    }

    // Count agent invocations even when resolving the directory or config fails.
    const telemetry = createTelemetry(baseDir, join(baseDir, distDir))

    // The parent records attribution; canary only needs its run ID to report results.
    // Remove it before launching an agent so later upgrades start their own runs.
    const inheritedRunId = process.env.__NEXT_AGENT_UPGRADE_RUN_ID
    delete process.env.__NEXT_AGENT_UPGRADE_RUN_ID
    const invalidRunId =
      inheritedRunId !== undefined && !UUID_PATTERN.test(inheritedRunId)
    const invalidNudgeId =
      nudgeSource !== null && !UUID_PATTERN.test(nudgeSource.id)

    const runId =
      inheritedRunId && !invalidRunId ? inheritedRunId : randomUUID()

    let resolvedPolicy: AgentUpgradePolicy | null = null
    let failureStage: 'cli' | 'guide' | 'handoff' = 'cli'
    let cliResultRecorded = false

    // Preparation and handoff can both fail; record only the first terminal result.
    const recordCLIResult = (
      result: AgentUpgradeCLIResult,
      handoffMethod: AgentUpgradeHandoffMethod | null,
      selectedAgentProduct: string | null
    ) => {
      if (cliResultRecorded) {
        return
      }
      cliResultRecorded = true
      telemetry.record(
        eventAgentUpgradeCLIResult({
          runId,
          result,
          resolvedPolicy,
          handoffMethod,
          selectedAgentProduct,
        })
      )
    }

    try {
      // Only the original invocation records a start, including invalid-input failures.
      // Origin and nudge attribution stay on that event; results join through runId.
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

      if (expectedVersion !== undefined && upgradeVersion !== expectedVersion) {
        throw new Error(
          `Expected @next/upgrade ${expectedVersion} for the upgrade, but launched ${upgradeVersion}.`
        )
      }

      // A workspace root must not launch an upgrade for an unspecified app.
      if (!findDir(baseDir, 'app') && !findDir(baseDir, 'pages')) {
        throw new Error(
          'No Next.js app found in this directory. Run the command from an app directory or pass its path:\n\n' +
            `next upgrade [directory] --agent${typeof options.agent === 'string' ? `=${options.agent}` : ''}`
        )
      }

      const upgradeType =
        typeof options.agent === 'string'
          ? options.agent
          : configuredPolicy === 'security' ||
              configuredPolicy === 'latest' ||
              configuredPolicy === 'experimental-future'
            ? configuredPolicy
            : 'security'

      if (
        upgradeType !== 'security' &&
        upgradeType !== 'latest' &&
        upgradeType !== 'experimental-future'
      ) {
        throw new Error(
          `Unsupported agent upgrade type ${JSON.stringify(upgradeType)}. Expected "security", "latest", or "experimental-future".`
        )
      }
      resolvedPolicy = upgradeType

      // Resolve the requested target before preparing an agent session.
      const { prepareUpgrade } =
        require('./agent/prepare') as typeof import('./agent/prepare')
      const assessmentSpinner = createSpinner('Preparing upgrade')
      const result = await prepareUpgrade(baseDir, upgradeType).finally(() =>
        assessmentSpinner?.stop()
      )

      // Expected assessment failures retain their status and stop before handoff.
      if (result.status === 'blocked' || result.status === 'unknown') {
        recordCLIResult(
          result.status === 'blocked' ? 'no_safe_target' : 'metadata_failure',
          null,
          null
        )
        Log.error('Could not prepare the upgrade:', result.reason)
        process.exitCode = 1
        return
      }

      if (result.status !== 'ready') {
        Log.info(result.reason)
        recordCLIResult('no_update_needed', null, null)
        return
      }

      const needsVersionUpdate =
        result.installedVersion !== result.targetVersion

      Log.info(
        needsVersionUpdate
          ? `Upgrade: Next.js ${result.installedVersion} → ${result.targetVersion}`
          : `Future Defaults: Next.js ${result.installedVersion}`
      )

      failureStage = 'guide'
      const prompt = await prepareUpgradeGuides({
        directory: baseDir,
        policy: upgradeType,
        upgrade: result,
        verbose: options.verbose,
        runId,
        upgradeVersion,
      })

      const { handoffUpgrade } =
        require('./agent/handoff') as typeof import('./agent/handoff')

      // Delivery is observable here; completing the upgrade belongs to the agent.
      failureStage = 'handoff'
      const handoffResult = await handoffUpgrade(
        prompt,
        baseDir,
        (method, selectedAgentProduct) => {
          recordCLIResult('handoff_issued', method, selectedAgentProduct)
        }
      )
      if (handoffResult === 'cancelled') {
        recordCLIResult('cancelled', null, null)
      } else if (handoffResult === 'failed') {
        recordCLIResult('handoff_failed', null, null)
      }
    } catch (error) {
      // Report the failed preparation stage while preserving the original error below.
      switch (failureStage) {
        case 'guide':
          recordCLIResult('guide_failure', null, null)
          break
        case 'handoff':
          recordCLIResult('handoff_failed', null, null)
          break
        case 'cli':
          recordCLIResult('cli_failure', null, null)
          break
      }

      Log.error(
        'Could not prepare the upgrade:',
        error instanceof Error ? error.message : error
      )
      process.exitCode = 1
    } finally {
      // Send queued results before this short-lived CLI invocation exits.
      await telemetry.flush()
    }

    return
  }

  baseDir = getProjectDir(directory)
  warnMissingReactDependencies(baseDir)

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
