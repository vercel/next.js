import type { UpgradeContext } from './nudge'
import type { UpgradeAdvisory } from '../../next-devtools/shared/upgrade-advisory'
import shellQuote from 'next/dist/compiled/shell-quote'
import { assessUpgrade } from './nudge'
import { isCI } from '../../server/ci-info'

export function createUpgradeAdvisory(
  directory: string,
  config: UpgradeContext,
  installedVersion: string
) {
  let snapshot: UpgradeAdvisory | null = null
  const policy = config.experimental.agenticAutoUpgrade
  const forced = process.env.__NEXT_AGENTIC_AUTO_UPGRADE === policy
  const assessment = (
    forced && isCI
      ? Promise.resolve(null)
      : assessUpgrade(directory, config, installedVersion, null, forced)
  ).then((advisory) => {
    if (advisory?.kind === 'security') {
      const appDirectory =
        process.platform === 'win32'
          ? `"${directory}"`
          : shellQuote.quote([directory])
      snapshot = {
        installedVersion,
        prompt: `Run \`next upgrade ${appDirectory} --ai=${advisory.policy}\` and follow its instructions.`,
      }
    }
    return advisory
  })

  return { assessment, getSnapshot: () => snapshot }
}
