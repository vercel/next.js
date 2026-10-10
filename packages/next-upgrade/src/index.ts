export { spawnNextUpgrade } from './cli/run'
export type {
  AgentUpgradePolicy,
  AgentUpgradeOrigin,
  AgentUpgradeCLIResult,
} from './cli/run'
export { reportAgentUpgradeAgentResult } from './cli/report'
export { prepareUpgrade } from './cli/agent/prepare'
export type { AgentUpgradeHandoffMethod } from './cli/agent/handoff'
export type { UpgradePreparation } from './shared/check-upgrade'
export type { UpgradeAction } from './nudge/terminal/prompt'
export {
  assessUpgrade,
  nudgeUpgrade,
  shouldPromptForUpgrade,
} from './nudge/nudge'
export type { NudgeKind, UpgradeContext, UpgradeReminder } from './nudge/nudge'
export {
  getPendingFutureDefaults,
  type FutureDefaultsConfig,
} from './shared/future-defaults'
export * from './next/telemetry'
export { runCLI } from './cli/standalone'
