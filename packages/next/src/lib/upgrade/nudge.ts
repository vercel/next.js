import semver from 'next/dist/compiled/semver'
import {
  claimNudgeRetry,
  formatAgentNudge,
  getUpgradeReminder,
  type UpgradeAction,
  type UpgradeReminder,
} from '../../compiled/next-upgrade'
export type { UpgradeReminder } from '../../compiled/next-upgrade'

import { resolve } from 'path'
import { randomUUID } from 'crypto'

import * as Log from '../../build/output/log'
import { isCI } from '../../server/ci-info'
import type { NextConfigComplete } from '../../server/config-shared'
import { getAgentName } from '../../telemetry/agent-name'
import {
  eventAgentUpgradeNudgeDecision,
  eventAgentUpgradeNudgeShown,
  eventAgentUpgradePolicyDetected,
} from '../../telemetry/events/agent-upgrade'
import type { Telemetry } from '../../telemetry/storage'

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
  const { getPrereleaseChannel, getUpgradeAssessment } =
    require('../../compiled/next-upgrade') as typeof import('../../compiled/next-upgrade')
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
  return getUpgradeReminder(
    directory,
    config,
    policy,
    installedVersion,
    assessment,
    stopBefore,
    forceVersionReminder
  )
}

// The terminal test needs a menu in CI and under agents, without the network.
function isTerminalForcedForTesting(): boolean {
  return process.env.__NEXT_AGENT_UPGRADE_FORCE_TERMINAL_FOR_TESTING === '1'
}

export async function shouldPromptForUpgrade(): Promise<boolean> {
  const { canPromptForUpgrade } =
    require('../../compiled/next-upgrade') as typeof import('../../compiled/next-upgrade')
  return (
    canPromptForUpgrade(isTerminalForcedForTesting(), isCI) &&
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
    const { canPromptForUpgrade, getUpgradeDismissal } =
      require('../../compiled/next-upgrade') as typeof import('../../compiled/next-upgrade')
    if (!canPromptForUpgrade(isTerminalForcedForTesting(), isCI)) {
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

    const { nudgeUpgradeForHuman } =
      require('../../compiled/next-upgrade') as typeof import('../../compiled/next-upgrade')
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

const allowedRetries = new Set(
  process.env.NEXT_PRIVATE_WORKER === '1'
    ? (process.env.NEXT_PRIVATE_ALLOWED_UPGRADE_RETRIES ?? '')
        .split(',')
        .filter((identity) => /^[a-f0-9]{64}$/.test(identity))
    : []
)

// Only Next can transfer an accepted retry to the parent supervising its workers.
async function allowNudgeRetry(
  options: { directory: string; distDir: string; command: 'dev' | 'build' },
  version: string,
  kind: NudgeKind
) {
  const { identity, allowed } = await claimNudgeRetry(
    options,
    version,
    kind,
    allowedRetries
  )
  if (!allowed || allowedRetries.has(identity)) {
    return allowed
  }
  if (options.command === 'dev' && process.env.NEXT_PRIVATE_WORKER === '1') {
    await new Promise<void>((complete, reject) => {
      process.send!(
        { nextUpgradeRetryAllowed: identity },
        (error: Error | null) => {
          if (error) {
            reject(error)
          } else {
            complete()
          }
        }
      )
    })
  }
  allowedRetries.add(identity)
  return true
}

async function nudgeUpgradeForAgent(
  options: { directory: string; distDir: string; command: 'dev' | 'build' },
  reminder: UpgradeReminder,
  nudgeId: string,
  agentProduct: string,
  telemetry: Telemetry | null,
  policyEvent: ReturnType<typeof eventAgentUpgradePolicyDetected>
): Promise<void> {
  const { summary, message, reference } = formatAgentNudge(reminder, nudgeId)
  let retryAllowed = false
  try {
    retryAllowed = await allowNudgeRetry(
      options,
      reminder.installedVersion,
      reminder.kind
    )
  } catch {
    Log.warn(
      'Could not prepare an upgrade retry. This command will remain blocked.'
    )
  }
  if (retryAllowed) {
    telemetry?.record(policyEvent)
    Log.warn(
      `${summary} This command is continuing after the upgrade reminder.${reference ? `\nReference: ${reference}` : ''}`
    )
    return
  }
  // Queue the full nudge once, then send it outside the command that is about to stop.
  if (telemetry) {
    try {
      if (telemetry.isEnabled || process.env.NEXT_TELEMETRY_DEBUG) {
        telemetry.flushDetached({
          mode: 'dev',
          dir: options.directory,
          distDir: resolve(options.directory, options.distDir),
          events: [
            policyEvent,
            eventAgentUpgradeNudgeShown({
              nudgeId,
              recipient: 'agent',
              agentProduct,
              sourceCommand: options.command,
              policy: reminder.policy,
              nudgeKind: reminder.kind,
            }),
          ],
        })
      }
    } catch (error) {
      Log.warn(`Could not queue upgrade telemetry: ${String(error)}`)
    }
  }
  const error = new Error(message)
  error.name =
    reminder.kind === 'security' ? 'SecurityFatalError' : 'UpgradeNudgeError'
  Object.assign(error, { exitCode: 1 })
  throw error
}
