import type { PackageManager } from '../../lib/helpers/get-pkg-manager'

// The upgrade workflow owns outcomes shared with telemetry payloads.
import type {
  AgentUpgradePolicy,
  AgentUpgradeOrigin,
  AgentUpgradeCLIResult,
} from 'next/dist/lib/upgrade/cli/run'
import type { AgentUpgradeHandoffMethod } from 'next/dist/lib/upgrade/cli/agent/handoff'

export type {
  AgentUpgradePolicy,
  AgentUpgradeOrigin,
  AgentUpgradeCLIResult,
} from 'next/dist/lib/upgrade/cli/run'
export type { AgentUpgradeHandoffMethod } from 'next/dist/lib/upgrade/cli/agent/handoff'

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
  fromVersion: string | null
  nodeVersion: string
  packageManager: PackageManager | null
  packageManagerVersion: string | null
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
  fromVersion: string | null
  targetVersion: string | null
}) {
  return event('NEXT_AGENT_UPGRADE_CLI_RESULT', fields)
}

// The agent reports its verified result separately from the CLI's prompt delivery.
export function eventAgentUpgradeAgentResult(fields: {
  runId: string
  result: 'success' | 'failure'
  resultVersion: string | null
}) {
  return event('NEXT_AGENT_UPGRADE_AGENT_RESULT', fields)
}
