import { randomUUID } from 'crypto'
import { updateInitialEnv } from '@next/env'
import * as Log from 'next/dist/build/output/log'
import type { NextConfigComplete } from 'next/dist/server/config-shared'
import type { Telemetry } from 'next/dist/telemetry/storage'
import {
  eventAgentUpgradeNudgeDecision,
  eventAgentUpgradeNudgeShown,
  eventAgentUpgradePolicyDetected,
} from 'next/dist/telemetry/events/agent-upgrade'
import semver from 'next/dist/compiled/semver'
import type { UpgradeAction } from './terminal/prompt'
import { getAgentName } from 'next/dist/telemetry/agent-name'
import { getPendingFutureDefaults } from '../shared/future-defaults'
import { isCI } from 'next/dist/server/ci-info'
import { nudgeUpgradeForAgent } from './agent/notify'
import { nudgeUpgradeForHuman } from './terminal/notify'
import { getUpgradeDismissal } from './terminal/preferences'

export type NudgeKind = 'security' | 'latest' | 'experimental-future'

function getRequestedUpgrade() {
  const policy = process.env.__NEXT_AGENT_UPGRADE
  return policy === 'security' ||
    policy === 'latest' ||
    policy === 'experimental-future'
    ? policy
    : null
}

export type UpgradeContext = Pick<
  NextConfigComplete,
  'distDir' | 'cacheComponents'
> & {
  configuredPolicy: NudgeKind | false | null
  experimental: { agentUpgrade: NudgeKind | false }
}

export type UpgradeReminder = {
  policy: NudgeKind
  installedVersion: string
} & (
  | {
      kind: 'security'
      reference: string | null
      targetVersion: string
    }
  | { kind: 'latest'; latestVersion: string | null; names: string[] }
  | { kind: 'experimental-future'; targetVersion: string; names: string[] }
)

export function getUpgradeContext(config: NextConfigComplete): UpgradeContext {
  return {
    distDir: config.distDir,
    cacheComponents: config.cacheComponents,
    configuredPolicy: config.experimental.agentUpgrade ?? null,
    experimental: {
      agentUpgrade:
        getRequestedUpgrade() ?? config.experimental.agentUpgrade ?? false,
    },
  }
}

export async function assessUpgrade(
  directory: string,
  config: UpgradeContext,
  installedVersion: string = process.env.__NEXT_VERSION || 'unknown',
  stopBefore: NudgeKind | null = null,
  forceVersionReminder: boolean = false
): Promise<UpgradeReminder | null> {
  const policy = config.experimental.agentUpgrade
  if (
    policy !== 'security' &&
    policy !== 'latest' &&
    policy !== 'experimental-future'
  ) {
    return null
  }
  if (isTerminalForcedForTesting()) {
    // Offer a fixed reminder without querying advisories or past dismissals.
    return {
      policy,
      installedVersion,
      kind: 'security',
      reference: null,
      targetVersion: installedVersion,
    }
  }
  if (stopBefore === 'security') {
    return null
  }

  if (!semver.valid(installedVersion)) {
    return null
  }
  const {
    getPrereleaseChannel,
    getUpgradeAssessment,
    getLatestUpgradeVersion,
  } =
    require('../shared/check-upgrade') as typeof import('../shared/check-upgrade')
  if (
    semver.prerelease(installedVersion) &&
    !getPrereleaseChannel(installedVersion)
  ) {
    return null
  }
  let assessment
  try {
    assessment = await getUpgradeAssessment(
      installedVersion,
      policy,
      stopBefore === 'latest'
    )
  } catch {
    Log.warn(
      'Could not check Next.js security advisories. Continuing without an upgrade assessment.'
    )
    return null
  }
  const { upgrade } = assessment
  if (upgrade.status !== 'ready') {
    // TODO: Record affected and upgrade.status in telemetry so we can see when
    // an advisory applies but no ready target was available to nudge.
    return null
  }
  if (assessment.affected) {
    return {
      kind: 'security',
      policy,
      installedVersion,
      reference: assessment.reference,
      targetVersion: upgrade.targetVersion,
    }
  }
  if (policy === 'security' || stopBefore === 'latest') {
    return null
  }
  const latestVersion = getLatestUpgradeVersion(
    installedVersion,
    upgrade.targetVersion
  )
  if (
    latestVersion ||
    (forceVersionReminder && upgrade.targetVersion !== installedVersion)
  ) {
    return {
      kind: 'latest',
      policy,
      installedVersion,
      latestVersion: upgrade.targetVersion,
      names:
        policy === 'experimental-future'
          ? getPendingFutureDefaults(
              directory,
              config,
              upgrade.targetVersion
            ).map((entry) => entry.name)
          : [],
    }
  }

  if (
    policy !== 'experimental-future' ||
    stopBefore === 'experimental-future'
  ) {
    return null
  }
  const pending = getPendingFutureDefaults(directory, config, installedVersion)
  if (pending.length === 0) {
    return null
  }
  return {
    kind: 'experimental-future',
    policy,
    installedVersion,
    targetVersion: upgrade.targetVersion,
    names: pending.map((entry) => entry.name),
  }
}

// The terminal test needs a menu in CI and under agents, without the network.
function isTerminalForcedForTesting(): boolean {
  return process.env.__NEXT_AGENT_UPGRADE_FORCE_TERMINAL_FOR_TESTING === '1'
}

function canPromptForUpgrade(): boolean {
  return (
    (!isCI || isTerminalForcedForTesting()) &&
    Boolean(process.stdin.isTTY && process.stdout.isTTY) &&
    process.env.TERM !== 'dumb'
  )
}

export async function runUpgrade(
  directory: string,
  policy: NudgeKind,
  nudgeId: string | null
) {
  // The agent's dev/build commands must not trigger this explicit request again.
  delete process.env.__NEXT_AGENT_UPGRADE
  updateInitialEnv({ __NEXT_AGENT_UPGRADE: undefined })
  const { spawnNextUpgrade } = await import('../cli/run.js')

  // Human Update actions invoke the CLI directly, so their ID does not need an env var.
  await spawnNextUpgrade(
    directory,
    { revision: 'latest', verbose: false, agent: policy },
    nudgeId ? { id: nudgeId, recipient: 'human' } : null
  )
  return process.exitCode ?? 0
}

export async function shouldPromptForUpgrade(): Promise<boolean> {
  return (
    canPromptForUpgrade() &&
    (isTerminalForcedForTesting() || !(await getAgentName()))
  )
}

export async function nudgeUpgrade(
  directory: string,
  config: UpgradeContext,
  command: 'dev' | 'build',
  signal: AbortSignal | null,
  initialAssessment: Promise<UpgradeReminder | null> | null,
  telemetryOptions: {
    telemetry: Telemetry
    onNudgeId: ((nudgeId: string) => void) | null
  } | null
): Promise<UpgradeAction | void> {
  const requested = getRequestedUpgrade()
  const policy = requested ?? config.experimental.agentUpgrade
  if (
    policy !== 'security' &&
    policy !== 'latest' &&
    policy !== 'experimental-future'
  ) {
    return
  }
  // Observe the effective policy even when assessment finds no upgrade to offer.
  const telemetry = telemetryOptions?.telemetry ?? null
  const policyEvent = eventAgentUpgradePolicyDetected({
    configuredPolicy: config.configuredPolicy ?? null,
    effectivePolicy: policy,
    policySource: requested ? 'environment' : 'config',
    sourceCommand: command,
  })
  if (requested && isCI) {
    telemetry?.record(policyEvent)
    return
  }

  // An agent's stopped command sends policy and nudge together before synchronous exit.
  const agent = isTerminalForcedForTesting() ? null : await getAgentName()
  if (!agent) {
    telemetry?.record(policyEvent)
  }
  const installedVersion = process.env.__NEXT_VERSION || 'unknown'
  let stopBefore: NudgeKind | null = null
  if (!agent) {
    if (!signal || signal.aborted) {
      return
    }
    if (!canPromptForUpgrade()) {
      return
    }
    if (!requested) {
      stopBefore = await getUpgradeDismissal(
        directory,
        installedVersion,
        policy
      )
    }
    if (signal.aborted) {
      return
    }
  }
  const reminder = await (
    stopBefore === null && initialAssessment && !isTerminalForcedForTesting()
      ? initialAssessment
      : assessUpgrade(
          directory,
          { ...config, experimental: { agentUpgrade: policy } },
          installedVersion,
          stopBefore,
          requested !== null
        )
  ).catch((error) => {
    if (agent) {
      telemetry?.record(policyEvent)
    }
    throw error
  })
  if (!reminder || signal?.aborted) {
    if (agent) {
      telemetry?.record(policyEvent)
    }
    return
  }

  // The nudge and any resulting upgrade run share this ID across processes.
  const nudgeId = randomUUID()
  if (agent) {
    await nudgeUpgradeForAgent(
      { directory, distDir: config.distDir, command },
      reminder,
      nudgeId,
      agent,
      telemetry,
      policyEvent
    )
  } else if (signal) {
    // Count a human nudge only after the menu renders, including its selected action.
    let shown = false
    const onShown = telemetryOptions
      ? () => {
          shown = true
          telemetryOptions.onNudgeId?.(nudgeId)
          telemetryOptions.telemetry.record(
            eventAgentUpgradeNudgeShown({
              nudgeId,
              recipient: 'human',
              agentProduct: null,
              sourceCommand: command,
              policy: reminder.policy,
              nudgeKind: reminder.kind,
            })
          )
        }
      : null

    const action = await nudgeUpgradeForHuman(
      directory,
      reminder,
      signal,
      onShown
    )

    // The caller flushes after it gives the terminal back.
    if (shown && telemetry && !signal.aborted) {
      telemetry.record(eventAgentUpgradeNudgeDecision({ nudgeId, action }))
    }
    return action
  }
}
