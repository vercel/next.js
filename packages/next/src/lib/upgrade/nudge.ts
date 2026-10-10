import { updateInitialEnv } from '@next/env'
import { resolve } from 'path'
import type { NextConfigComplete } from '../../server/config-shared'
import type { Telemetry } from '../../telemetry/storage'
import { getAgentName } from '../../telemetry/agent-name'
import { isCI } from '../../server/ci-info'
import { findDir } from '../find-pages-dir'
import {
  eventAgentUpgradePolicyDetected,
  eventAgentUpgradeNudgeShown,
  eventAgentUpgradeNudgeDecision,
} from '../../telemetry/events/agent-upgrade'
import {
  assessUpgrade as assess,
  nudgeUpgrade as nudge,
  shouldPromptForUpgrade as shouldPrompt,
  type NudgeKind,
  type UpgradeContext,
  type UpgradeReminder,
} from '@next/upgrade'
import {
  getPendingFutureDefaults as getPending,
  type FutureDefaultsConfig,
} from '@next/upgrade'

export type { NudgeKind, UpgradeContext, UpgradeReminder } from '@next/upgrade'

// Keep Next's config, environment, and worker integrations at the call site.
function getRequestedUpgrade() {
  const policy = process.env.__NEXT_AGENT_UPGRADE
  return policy === 'security' ||
    policy === 'latest' ||
    policy === 'experimental-future'
    ? policy
    : null
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

function getPendingFutureDefaults(
  directory: string,
  config: FutureDefaultsConfig,
  version: string
) {
  return getPending(directory, config, version, findDir)
}

export async function assessUpgrade(
  directory: string,
  config: UpgradeContext,
  installedVersion: string = process.env.__NEXT_VERSION || 'unknown',
  stopBefore: NudgeKind | null = null,
  forceVersionReminder: boolean = false
) {
  return assess(
    directory,
    config,
    installedVersion,
    stopBefore,
    forceVersionReminder,
    getPendingFutureDefaults
  )
}

export async function shouldPromptForUpgrade(): Promise<boolean> {
  return shouldPrompt(isCI, getAgentName)
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
) {
  const telemetry = telemetryOptions?.telemetry ?? null
  return nudge(
    directory,
    config,
    command,
    signal,
    initialAssessment,
    telemetry && telemetryOptions
      ? {
          onNudgeId: telemetryOptions.onNudgeId,
          telemetry: {
            recordPolicyDetected(fields) {
              telemetry.record(eventAgentUpgradePolicyDetected(fields))
            },
            recordNudgeShown(fields) {
              telemetry.record(eventAgentUpgradeNudgeShown(fields))
            },
            recordNudgeDecision(fields) {
              telemetry.record(eventAgentUpgradeNudgeDecision(fields))
            },
            flushNudge(dir, distDir, policy, shown) {
              if (telemetry.isEnabled || process.env.NEXT_TELEMETRY_DEBUG) {
                telemetry.flushDetached({
                  mode: 'dev',
                  dir,
                  distDir: resolve(dir, distDir),
                  events: [
                    eventAgentUpgradePolicyDetected(policy),
                    eventAgentUpgradeNudgeShown(shown),
                  ],
                })
              }
            },
          },
        }
      : null,
    {
      isCI,
      requestedPolicy: getRequestedUpgrade(),
      getAgentName,
      getInstalledVersion: () => process.env.__NEXT_VERSION || 'unknown',
      assessUpgrade,
      onRetryAllowed(identity) {
        return new Promise<void>((complete, reject) => {
          const message = { nextUpgradeRetryAllowed: identity }
          process.send!(message, (error: Error | null) => {
            if (error) {
              reject(error)
            } else {
              complete()
            }
          })
        })
      },
    }
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
  const { spawnNextUpgrade } = await import('../../cli/next-upgrade.js')

  // Human Update actions invoke the CLI directly, so their ID does not need an env var.
  await spawnNextUpgrade(
    directory,
    { revision: 'latest', verbose: false, agent: policy },
    nudgeId ? { id: nudgeId, recipient: 'human' } : null
  )
  return process.exitCode ?? 0
}
