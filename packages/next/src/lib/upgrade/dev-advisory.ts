import type { UpgradeContext } from './nudge'
import type { UpgradeAdvisory } from '../../next-devtools/shared/upgrade-advisory'
import shellQuote from 'next/dist/compiled/shell-quote'
import { assessUpgrade } from './nudge'

export function createUpgradeAdvisory(
  directory: string,
  config: UpgradeContext,
  installedVersion: string
) {
  let snapshot: UpgradeAdvisory | null = null
  const policy = config.experimental.agenticAutoUpgrade
  const assessment = assessUpgrade(
    directory,
    config,
    installedVersion,
    null,
    process.env.__NEXT_AGENTIC_AUTO_UPGRADE === policy
  ).then((advisory) => {
    if (advisory?.kind === 'security') {
      snapshot = {
        installedVersion,
        prompt: `Run \`next upgrade ${shellQuote.quote([directory])} --ai=${advisory.policy}\` and follow its instructions.`,
      }
    }
    return advisory
  })

  return { assessment, getSnapshot: () => snapshot }
}
