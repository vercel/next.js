// The part of @next/upgrade that `next dev` and `next build` load on every run
// to decide whether they can offer an upgrade and to hold their output while
// the upgrade menu is open. It is bundled on its own (dist/terminal.js) so
// startup doesn't pay for the rest of the package, which loads from
// dist/index.js only when an upgrade is actually offered.
export type { UpgradeMenuResult } from './prompt-output'

export {
  closedUpgradeMenu,
  createPromptOutput,
  drainPromptOutput,
  flushUpgradeTelemetry,
  getPromptOutputEnv,
  reassertRawMode,
  showUpgradeMenu,
} from './prompt-output'

export { shouldPromptForUpgrade } from './prompt-gate'
