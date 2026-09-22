import { randomUUID } from 'crypto'
import { join } from 'path'
import { loadEnvConfig, updateInitialEnv } from '@next/env'
import loadConfig from '../../server/config'
import { normalizeConfig, type NextConfig } from '../../server/config-shared'
import { PHASE_PRODUCTION_BUILD } from '../../shared/lib/constants'
import { interopDefault } from '../interop-default'
import { getAgentName } from '../../telemetry/agent-name'
import {
  eventUpgradeStarted,
  eventUpgradePrepared,
  eventUpgradeHandoff,
  eventUpgradeFinished,
  type EventUpgradeStarted,
  type EventUpgradePrepared,
  type EventUpgradeHandoff,
  type UpgradeType,
} from '../../telemetry/events/upgrade'
import { Telemetry } from '../../telemetry/storage'
import { hasCustomExportOutput } from '../../export/utils'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type UpgradeContext = EventUpgradeStarted & { startedAt: number }

export function parseUpgradeReminder(value: string | undefined): {
  reminderId: string | null
  trigger: EventUpgradeStarted['trigger']
} {
  const [trigger, reminderId, extra] = value?.split(':') ?? []
  if (
    (trigger === 'dev' || trigger === 'build') &&
    UUID.test(reminderId ?? '') &&
    extra === undefined
  ) {
    return { reminderId, trigger }
  }
  return { reminderId: null, trigger: 'upgrade' }
}

function readContext(value: string | undefined): UpgradeContext | null {
  try {
    const context = JSON.parse(value ?? '')
    if (
      UUID.test(context.upgradeId) &&
      (context.reminderId === null || UUID.test(context.reminderId)) &&
      ['human', 'agent'].includes(context.actor) &&
      ['security', 'latest', 'future'].includes(context.upgradeType) &&
      ['dev', 'build', 'upgrade'].includes(context.trigger) &&
      Number.isSafeInteger(context.startedAt) &&
      context.startedAt > 0 &&
      context.startedAt <= Date.now()
    ) {
      return context
    }
  } catch {}
  return null
}

// Upgrades may start on older apps. Read their config without validating legacy
// options against the invoking CLI's schema.
export async function loadUpgradeConfig(
  directory: string
): Promise<NextConfig> {
  const rawConfig = await loadConfig(PHASE_PRODUCTION_BUILD, directory, {
    rawConfig: true,
  })
  return normalizeConfig(PHASE_PRODUCTION_BUILD, interopDefault(rawConfig))
}

export class UpgradeTelemetry {
  private prepared = false
  private finished = false

  private constructor(
    private telemetry: Telemetry,
    private context: UpgradeContext
  ) {}

  static async start(
    directory: string,
    upgradeType: UpgradeType,
    reminder: string | undefined
  ): Promise<UpgradeTelemetry | null> {
    const inherited = process.env.__NEXT_UPGRADE_TELEMETRY
    // Config loading may have cached this one-use context. Clear both copies so
    // Future preparation's resetEnv() cannot restore it for the launched agent
    // and cause later upgrades to reuse this attempt's ID and start time.
    delete process.env.__NEXT_UPGRADE_TELEMETRY
    updateInitialEnv({ __NEXT_UPGRADE_TELEMETRY: undefined })
    try {
      // Load app-local consent before constructing the telemetry instance.
      loadEnvConfig(directory, false)
      const context = readContext(inherited)
      // Use the same resolved config as build telemetry, including adapter
      // changes, so CI/Docker reads the existing consent and identity store.
      const config = await loadConfig(PHASE_PRODUCTION_BUILD, directory, {
        silent: true,
      })
      // Match build telemetry: for static exports, distDir names the exported
      // output, while the build's cache and telemetry still live in .next.
      const distDir = hasCustomExportOutput(config) ? '.next' : config.distDir
      const telemetry = new Telemetry(
        { distDir: join(directory, distDir) },
        directory
      )
      const attempt = new UpgradeTelemetry(
        telemetry,
        context ?? {
          upgradeId: randomUUID(),
          ...parseUpgradeReminder(reminder),
          actor: (await getAgentName()) ? 'agent' : 'human',
          upgradeType,
          startedAt: Date.now(),
        }
      )
      if (!context) {
        const { startedAt: _, ...payload } = attempt.context
        telemetry.record(eventUpgradeStarted(payload))
      }
      return attempt
    } catch {
      // Telemetry must never prevent an upgrade.
      return null
    }
  }

  serialize(): string {
    return JSON.stringify(this.context)
  }

  private elapsed(): number {
    return Math.max(0, Date.now() - this.context.startedAt)
  }

  recordPrepared(
    prepareState: EventUpgradePrepared['prepareState'],
    installedVersion: string | null,
    targetVersion: string | null
  ): void {
    if (this.prepared) {
      return
    }
    this.prepared = true
    this.telemetry.record(
      eventUpgradePrepared({
        upgradeId: this.context.upgradeId,
        prepareState,
        installedVersion,
        targetVersion,
        durationMs: this.elapsed(),
      })
    )
  }

  recordHandoff(handoffState: EventUpgradeHandoff['handoffState']): void {
    this.telemetry.record(
      eventUpgradeHandoff({
        upgradeId: this.context.upgradeId,
        handoffState,
        durationMs: this.elapsed(),
      })
    )
    if (handoffState === 'failed') {
      this.recordFailure()
    }
  }

  recordFailure(): void {
    if (this.finished) {
      return
    }
    this.finished = true
    // Only CLI-owned failures are observable here. Agent exit codes do not
    // establish whether the app was migrated and verified successfully.
    this.telemetry.record(
      eventUpgradeFinished({
        upgradeId: this.context.upgradeId,
        outcome: 'failure',
        durationMs: this.elapsed(),
      })
    )
  }

  async flush(): Promise<void> {
    await this.telemetry.flush()
  }
}
