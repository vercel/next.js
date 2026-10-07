// Shared values keep event payloads consistent across the CLI, nudges, and handoffs.
export type AgentUpgradePolicy = 'security' | 'latest' | 'experimental-future'

export type AgentUpgradeOrigin =
  | 'human_manual'
  | 'human_nudge'
  | 'agent_manual'
  | 'agent_nudge'

export type AgentUpgradeHandoffMethod =
  | 'existing_agent'
  | 'launched_agent'
  | 'copied_prompt'
  | 'printed_prompt'

export type AgentUpgradeCLIResult =
  | 'no_update_needed'
  | 'no_safe_target'
  | 'metadata_failure'
  | 'guide_failure'
  | 'cancelled'
  | 'handoff_issued'
  | 'handoff_failed'
  | 'cli_failure'

// Version every event so consumers can distinguish future schema changes.
function event<T extends object>(eventName: string, fields: T) {
  return { eventName, payload: { schemaVersion: 1, ...fields } }
}

// Measure configured reach separately from whether an upgrade reminder is needed.
export function eventAgentUpgradePolicyDetected(fields: {
  configuredPolicy: AgentUpgradePolicy | false | null
  effectivePolicy: AgentUpgradePolicy
  policySource: 'config' | 'environment'
  sourceCommand: 'dev' | 'build'
}) {
  return event('NEXT_AGENT_UPGRADE_POLICY_DETECTED', fields)
}

// Correlate a displayed reminder with a later upgrade invocation.
export function eventAgentUpgradeNudgeShown(fields: {
  nudgeId: string
  recipient: 'human' | 'agent'
  agentProduct: string | null
  sourceCommand: 'dev' | 'build'
  policy: AgentUpgradePolicy
  nudgeKind: AgentUpgradePolicy
}) {
  return event('NEXT_AGENT_UPGRADE_NUDGE_SHOWN', fields)
}

// Human menus expose a decision directly; agent decisions are inferred from runs.
export function eventAgentUpgradeNudgeDecision(fields: {
  nudgeId: string
  action: 'update' | 'skip' | 'dismiss' | 'interrupt'
}) {
  return event('NEXT_AGENT_UPGRADE_NUDGE_DECISION', fields)
}

// Count invocations independently of whether preparation or handoff finishes.
export function eventAgentUpgradeRunStarted(fields: {
  runId: string
  nudgeId: string | null
  origin: AgentUpgradeOrigin
  agentProduct: string | null
  requestedPolicy: AgentUpgradePolicy | null
}) {
  return event('NEXT_AGENT_UPGRADE_RUN_STARTED', fields)
}

// Report the CLI's preparation and prompt delivery, not completion of the agent's work.
export function eventAgentUpgradeCLIResult(fields: {
  runId: string
  result: AgentUpgradeCLIResult
  resolvedPolicy: AgentUpgradePolicy | null
  handoffMethod: AgentUpgradeHandoffMethod | null
  selectedAgentProduct: string | null
}) {
  return event('NEXT_AGENT_UPGRADE_CLI_RESULT', fields)
}

// The agent reports its verified result separately from the CLI's prompt delivery.
export function eventAgentUpgradeAgentResult(fields: {
  runId: string
  result: 'success' | 'failure'
}) {
  return event('NEXT_AGENT_UPGRADE_AGENT_RESULT', fields)
}
