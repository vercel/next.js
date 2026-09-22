import { randomUUID } from 'crypto'
import { resolve } from 'path'
import { traceGlobals } from '../../trace/shared'
import {
  eventUpgradeMessageShown,
  type EventUpgradeMessageShown,
  type UpgradeType,
} from '../../telemetry/events/upgrade'
import { Telemetry } from '../../telemetry/storage'

export class UpgradeReminder extends Error {
  readonly exitCode = 1
  #recorded = false
  #directory: string
  #distDir: string
  #event: EventUpgradeMessageShown

  constructor(
    message: string,
    name: string,
    directory: string,
    distDir: string,
    event: EventUpgradeMessageShown
  ) {
    super(message)
    this.name = name
    this.#directory = directory
    this.#distDir = distDir
    this.#event = event
  }

  static create(
    message: string,
    name: string,
    directory: string,
    distDir: string,
    upgradeType: UpgradeType,
    reminderKind: UpgradeType,
    trigger: 'dev' | 'build'
  ): UpgradeReminder {
    const reminderId = randomUUID()
    return new UpgradeReminder(
      message.replace(
        'next upgrade --ai',
        `next upgrade --ai --upgrade-reminder ${trigger}:${reminderId}`
      ),
      name,
      directory,
      distDir,
      { reminderId, audience: 'agent', upgradeType, reminderKind, trigger }
    )
  }

  async recordShown(): Promise<void> {
    if (this.#recorded) {
      return
    }
    this.#recorded = true
    try {
      const telemetry: Telemetry =
        traceGlobals.get('telemetry') ??
        new Telemetry(
          { distDir: resolve(this.#directory, this.#distDir) },
          this.#directory
        )
      telemetry.record(eventUpgradeMessageShown(this.#event))
      // These reminders can be followed immediately by process.exit().
      await telemetry.flush()
    } catch {
      // Reporting must not change whether the command proceeds or exits.
    }
  }
}

// Call only after the reminder has actually been printed. Error construction,
// assessment, and propagation through other catch blocks are not exposures.
export async function recordUpgradeReminder(error: unknown): Promise<void> {
  if (error instanceof UpgradeReminder) {
    await error.recordShown()
  }
}
