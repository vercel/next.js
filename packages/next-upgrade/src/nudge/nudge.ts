import { randomUUID } from 'crypto'
import * as Log from '../shared/log'
import semver from 'semver'
import type { UpgradeAction } from './terminal/prompt'
import type {
  FutureDefaultsConfig,
  FutureDefaultEntry,
} from '../shared/future-defaults'
import { nudgeUpgradeForAgent } from './agent/notify'
import { nudgeUpgradeForHuman } from './terminal/notify'
import { getUpgradeDismissal } from './terminal/preferences'

export type NudgeKind = 'security' | 'latest' | 'experimental-future'

export type UpgradeContext = FutureDefaultsConfig & {
  distDir: string
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

// Keep delivery and event encoding in Next while nudges decide when to emit them.
export type UpgradePolicyEvent = {
  configuredPolicy: NudgeKind | false | null
  effectivePolicy: NudgeKind
  policySource: 'config' | 'environment'
  sourceCommand: 'dev' | 'build'
}

export type UpgradeNudgeTelemetry = {
  recordPolicyDetected(fields: UpgradePolicyEvent): void
  recordNudgeShown(fields: {
    nudgeId: string
    recipient: 'human' | 'agent'
    agentProduct: string | null
    sourceCommand: 'dev' | 'build'
    policy: NudgeKind
    nudgeKind: NudgeKind
  }): void
  recordNudgeDecision(fields: { nudgeId: string; action: UpgradeAction }): void
  flushNudge(
    directory: string,
    distDir: string,
    policy: UpgradePolicyEvent,
    shown: Parameters<UpgradeNudgeTelemetry['recordNudgeShown']>[0]
  ): void
}

export async function assessUpgrade(
  directory: string,
  config: UpgradeContext,
  installedVersion: string,
  stopBefore: NudgeKind | null,
  forceVersionReminder: boolean,
  getPendingFutureDefaults: (
    directory: string,
    config: FutureDefaultsConfig,
    version: string
  ) => FutureDefaultEntry[]
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

function canPromptForUpgrade(isCI: boolean): boolean {
  return (
    (!isCI || isTerminalForcedForTesting()) &&
    Boolean(process.stdin.isTTY && process.stdout.isTTY) &&
    process.env.TERM !== 'dumb'
  )
}

export async function shouldPromptForUpgrade(
  isCI: boolean,
  getAgentName: () => Promise<string | null>
): Promise<boolean> {
  return (
    canPromptForUpgrade(isCI) &&
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
    telemetry: UpgradeNudgeTelemetry
    onNudgeId: ((nudgeId: string) => void) | null
  } | null,
  dependencies: {
    isCI: boolean
    requestedPolicy: NudgeKind | null
    getAgentName(): Promise<string | null>
    getInstalledVersion(): string
    assessUpgrade(
      directory: string,
      config: UpgradeContext,
      installedVersion: string,
      stopBefore: NudgeKind | null,
      forceVersionReminder: boolean
    ): Promise<UpgradeReminder | null>
    onRetryAllowed(identity: string): Promise<void>
  }
): Promise<UpgradeAction | void> {
  const requested = dependencies.requestedPolicy
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
  const policyEvent: UpgradePolicyEvent = {
    configuredPolicy: config.configuredPolicy ?? null,
    effectivePolicy: policy,
    policySource: requested ? 'environment' : 'config',
    sourceCommand: command,
  }
  if (requested && dependencies.isCI) {
    telemetry?.recordPolicyDetected(policyEvent)
    return
  }

  // An agent's stopped command sends policy and nudge together before synchronous exit.
  const agent = isTerminalForcedForTesting()
    ? null
    : await dependencies.getAgentName()
  if (!agent) {
    telemetry?.recordPolicyDetected(policyEvent)
  }
  const installedVersion = dependencies.getInstalledVersion()
  let stopBefore: NudgeKind | null = null
  if (!agent) {
    if (!signal || signal.aborted) {
      return
    }
    if (!canPromptForUpgrade(dependencies.isCI)) {
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
      : dependencies.assessUpgrade(
          directory,
          { ...config, experimental: { agentUpgrade: policy } },
          installedVersion,
          stopBefore,
          requested !== null
        )
  ).catch((error) => {
    if (agent) {
      telemetry?.recordPolicyDetected(policyEvent)
    }
    throw error
  })
  if (!reminder || signal?.aborted) {
    if (agent) {
      telemetry?.recordPolicyDetected(policyEvent)
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
      policyEvent,
      dependencies.onRetryAllowed
    )
  } else if (signal) {
    // Count a human nudge only after the menu renders, including its selected action.
    let shown = false
    const onShown = telemetryOptions
      ? () => {
          shown = true
          telemetryOptions.onNudgeId?.(nudgeId)
          telemetryOptions.telemetry.recordNudgeShown({
            nudgeId,
            recipient: 'human',
            agentProduct: null,
            sourceCommand: command,
            policy: reminder.policy,
            nudgeKind: reminder.kind,
          })
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
      telemetry.recordNudgeDecision({ nudgeId, action })
    }
    return action
  }
}
