export type UpgradeType = 'security' | 'latest' | 'future'
export type UpgradeTrigger = 'dev' | 'build' | 'upgrade'

export type EventUpgradeMessageShown = {
  reminderId: string
  audience: 'human' | 'agent'
  upgradeType: UpgradeType
  reminderKind: UpgradeType
  trigger: 'dev' | 'build'
}

export type EventUpgradeStarted = {
  upgradeId: string
  reminderId: string | null
  actor: 'human' | 'agent'
  upgradeType: UpgradeType
  trigger: UpgradeTrigger
}

export type EventUpgradePrepared = {
  upgradeId: string
  prepareState: 'ready' | 'unaffected' | 'blocked' | 'unknown'
  installedVersion: string | null
  targetVersion: string | null
  durationMs: number
}

export type EventUpgradeHandoff = {
  upgradeId: string
  handoffState:
    | 'current-agent'
    | 'codex'
    | 'claude'
    | 'copied'
    | 'printed'
    | 'cancelled'
    | 'failed'
  durationMs: number
}

export type EventUpgradeFinished = {
  upgradeId: string
  outcome: 'success' | 'failure'
  durationMs: number
}

export function eventUpgradeMessageShown(payload: EventUpgradeMessageShown) {
  return { eventName: 'NEXT_UPGRADE_MESSAGE_SHOWN', payload }
}

export function eventUpgradeStarted(payload: EventUpgradeStarted) {
  return { eventName: 'NEXT_UPGRADE_STARTED', payload }
}

export function eventUpgradePrepared(payload: EventUpgradePrepared) {
  return { eventName: 'NEXT_UPGRADE_PREPARED', payload }
}

export function eventUpgradeHandoff(payload: EventUpgradeHandoff) {
  return { eventName: 'NEXT_UPGRADE_HANDOFF', payload }
}

export function eventUpgradeFinished(payload: EventUpgradeFinished) {
  return { eventName: 'NEXT_UPGRADE_FINISHED', payload }
}
