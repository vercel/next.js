// The public API of @next/upgrade. `next` uses it to run `next upgrade` and to
// show upgrade nudges from `next dev` and `next build`; the `next-upgrade`
// executable uses `runCli`. The upgrade menu that `next dev` and `next build`
// show lives in the separately bundled `@next/upgrade/dist/terminal`.
export type { NudgeKind, UpgradeContext, UpgradeReminder } from './nudge'
export type { NextUpgradeOptions } from './agent-upgrade'
export type { UpgradeTelemetry } from './next-host'

export {
  assessUpgrade,
  getUpgradeContext,
  nudgeUpgrade,
  runUpgrade,
  shouldPromptForUpgrade,
} from './nudge'

export {
  reportAgentUpgradeAgentResult,
  spawnNextUpgrade as runNextUpgrade,
} from './agent-upgrade'

export { runCli } from './cli'
