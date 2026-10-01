// Shared values keep event payloads consistent across the CLI, nudges, and handoffs.
export type AIUpgradePolicy = 'security' | 'latest' | 'experimental-future'

export type AIUpgradeOrigin =
  | 'human_manual'
  | 'human_nudge'
  | 'agent_manual'
  | 'agent_nudge'

// Version every event so consumers can distinguish future schema changes.
function event<T extends object>(eventName: string, fields: T) {
  return { eventName, payload: { schemaVersion: 1, ...fields } }
}

// Measure configured reach separately from whether an upgrade reminder is needed.
export function eventAIUpgradePolicyDetected(fields: {
  configuredPolicy: AIUpgradePolicy | false | null
  effectivePolicy: AIUpgradePolicy
  policySource: 'config' | 'environment'
  sourceCommand: 'dev' | 'build'
}) {
  return event('NEXT_AI_UPGRADE_POLICY_DETECTED', fields)
}

// Correlate a displayed reminder with a later upgrade invocation.
export function eventAIUpgradeNudgeShown(fields: {
  nudgeId: string
  recipient: 'human' | 'agent'
  agentProduct: string | null
  sourceCommand: 'dev' | 'build'
  policy: AIUpgradePolicy
  nudgeKind: AIUpgradePolicy
}) {
  return event('NEXT_AI_UPGRADE_NUDGE_SHOWN', fields)
}

// Human menus expose a decision directly; agent decisions are inferred from runs.
export function eventAIUpgradeNudgeDecision(fields: {
  nudgeId: string
  action: 'update' | 'skip' | 'dismiss' | 'interrupt'
}) {
  return event('NEXT_AI_UPGRADE_NUDGE_DECISION', fields)
}

// Count invocations independently of whether preparation or handoff finishes.
export function eventAIUpgradeRunStarted(fields: {
  runId: string
  nudgeId: string | null
  origin: AIUpgradeOrigin
  agentProduct: string | null
  requestedPolicy: AIUpgradePolicy | null
}) {
  return event('NEXT_AI_UPGRADE_RUN_STARTED', fields)
}
