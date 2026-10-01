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
