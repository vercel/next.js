import semver from 'next/dist/compiled/semver'
import { nudgeUpgradeForAgent } from './nudge-agent/notify'
import {
  getUpgradeReminder,
  type UpgradeReminder,
} from './shared/check-upgrade'
export type { UpgradeReminder } from './shared/check-upgrade'

import { execFile } from 'child_process'
import { createHash, randomUUID } from 'crypto'
import { realpath } from 'fs/promises'
import { basename, dirname, relative, resolve } from 'path'
import { promisify } from 'util'

import * as Log from '../build/output/log'
import type { UpgradeAction } from '../lib/upgrade/prompt'
import { isCI } from '../server/ci-info'
import type { NextConfigComplete } from '../server/config-shared'
import { getAgentName } from '../telemetry/agent-name'
import {
  eventAgentUpgradeNudgeDecision,
  eventAgentUpgradeNudgeShown,
  eventAgentUpgradePolicyDetected,
} from '../telemetry/events/agent-upgrade'
import type { Telemetry } from '../telemetry/storage'

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
    require('./shared/check-upgrade') as typeof import('./shared/check-upgrade')
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
    installedVersion,
    assessment,
    stopBefore,
    forceVersionReminder
  )
}

async function getUpgradePreferences(directory: string) {
  const Conf =
    require('next/dist/compiled/conf') as typeof import('next/dist/compiled/conf')
  const project = await realpath(directory)
  let identity = project
  let projectName = basename(project)
  try {
    const { stdout } = await promisify(execFile)(
      'git',
      ['rev-parse', '--show-toplevel', '--git-common-dir'],
      { cwd: project, timeout: 1000 }
    )
    const [root, common] = stdout.trimEnd().split('\n')
    const commonDirectory = await realpath(resolve(project, common))
    const appPath = relative(await realpath(root), project)
    // Worktrees share a Git directory, but monorepo apps need separate keys.
    identity = `${commonDirectory}\0${appPath}`
    projectName = basename(
      appPath ||
        (basename(commonDirectory) === '.git'
          ? dirname(commonDirectory)
          : commonDirectory)
    )
  } catch {
    // Apps outside Git (or without Git installed) keep their directory identity.
  }
  const hash = createHash('sha256').update(identity).digest('hex')
  // Conf treats dots as separators, including dots in directory names.
  const name = encodeURIComponent(projectName).replace(/\./g, '%2E')
  const key = `agent-upgrade.${name}.${hash}`
  // Upgrade preferences share Next.js' global config location, not telemetry consent.
  return { key, preferences: new Conf({ projectName: 'nextjs' }) }
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

async function getUpgradeDismissal(
  directory: string,
  version: string,
  policy: NudgeKind
): Promise<NudgeKind | null> {
  try {
    const { key, preferences } = await getUpgradePreferences(directory)
    for (const kind of ['security', 'latest', 'experimental-future'] as const) {
      if (preferences.get(`${key}.${kind}`) === `${version}:${policy}`) {
        return kind
      }
    }
  } catch {
    // A preferences failure must not prevent assessing or skipping a reminder.
  }
  return null
}

async function nudgeUpgradeForHuman(
  directory: string,
  reminder: UpgradeReminder,
  signal: AbortSignal,
  onShown: (() => void) | null
): Promise<UpgradeAction> {
  if (signal.aborted) {
    return 'skip'
  }
  let message: string
  if (reminder.kind === 'security') {
    message = `⚠ Installed Next.js version ${reminder.installedVersion} is affected by a known security vulnerability.`
    message += `\n\nNext.js security version upgrade available: ${reminder.installedVersion} -> ${reminder.targetVersion}`
  } else if (reminder.policy === 'experimental-future') {
    const targetVersion =
      reminder.kind === 'latest'
        ? reminder.latestVersion
        : reminder.targetVersion
    const versions =
      targetVersion !== reminder.installedVersion
        ? ` ${reminder.installedVersion} -> ${targetVersion ?? '[target version]'}`
        : ''
    message = `Next.js Future Default upgrade available:${versions}`
    if (reminder.names.length > 0) {
      message += `\n\n${reminder.names.map((name) => `- ${name}`).join('\n')}`
    }
  } else if (reminder.kind === 'latest') {
    message = `Next.js latest version upgrade available: ${reminder.installedVersion} -> ${reminder.latestVersion ?? '[target version]'}`
  } else {
    return 'skip'
  }
  const { promptUpgrade } =
    require('../lib/upgrade/prompt') as typeof import('../lib/upgrade/prompt')
  const action = await promptUpgrade({
    message,
    signal,
    canUpdate: true,
    onShown,
  })
  if (signal.aborted) {
    return 'skip'
  }
  if (action === 'dismiss') {
    try {
      const { key, preferences } = await getUpgradePreferences(directory)
      preferences.set(
        `${key}.${reminder.kind}`,
        `${reminder.installedVersion}:${reminder.policy}`
      )
    } catch {
      Log.warn(
        'Could not save your upgrade reminder preference. Skipping for this session.'
      )
    }
  }
  return action
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
