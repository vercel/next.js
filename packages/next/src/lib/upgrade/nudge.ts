import * as Log from '../../build/output/log'
import { getAgentName } from '../../telemetry/agent-name'
import { bold } from '../picocolors'

export async function nudgeIfLatestUpgradeNeeded(
  directory: string
): Promise<void> {
  try {
    if (!(await getAgentName())) {
      return
    }

    const { getLatestUpgradeVersion } =
      require('./prepare-upgrade') as typeof import('./prepare-upgrade')
    const installedVersion = process.env.__NEXT_VERSION || 'unknown'
    const latestVersion = await getLatestUpgradeVersion(installedVersion)

    if (!latestVersion) {
      return
    }

    Log.info(
      `Next.js ${latestVersion} is available. You're using ${installedVersion}.\n` +
        `Run \`next upgrade ${JSON.stringify(directory)} --agentic=latest\` to upgrade when you're ready.\n\n` +
        'Reference: https://registry.npmjs.org/next/latest\n\n' +
        "Note: This reminder is enabled by `experimental.agenticAutoUpgrade: 'latest'`."
    )
  } catch {
    // A release reminder is best-effort; lookup failures should stay quiet.
  }
}

export async function nudgeIfSecurityUpgradeNeeded(
  directory: string
): Promise<void> {
  try {
    if (!(await getAgentName())) {
      return
    }

    // Reuse upgrade's advisory readers only after detecting an agent.
    const { getSecurityAdvisorySummary } =
      require('./prepare-upgrade') as typeof import('./prepare-upgrade')
    const advisorySummary = await getSecurityAdvisorySummary(
      process.env.__NEXT_VERSION || 'unknown'
    )

    if (!advisorySummary) {
      return
    }

    const { counts, reference } = advisorySummary
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)

    if (total === 0) {
      return
    }

    const summary = new Intl.ListFormat('en', { type: 'conjunction' }).format(
      Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([severity, count]) => {
          const label =
            severity === 'unknown' ? 'UNKNOWN SEVERITY' : severity.toUpperCase()
          return `${count} ${label}`
        })
    )

    Log.warn(
      `Your version of Next.js is affected by ${summary} published\n` +
        `security ${total === 1 ? 'advisory' : 'advisories'} and can be automatically upgraded.\n\n` +
        `We ${bold('strongly recommend')} you upgrade Next.js.\n\n` +
        `Run \`next upgrade ${JSON.stringify(directory)} --ai\` to upgrade when you're ready.` +
        `\n\nReference: ${reference}\n\n` +
        "Note: This reminder is enabled by `experimental.agenticAutoUpgrade: 'security'`."
    )
  } catch {
    // Callers do not await this advisory check. Contain failures so the warning
    // cannot reject startup or interrupt the agent's original task.
    Log.warn(
      'Could not check Next.js security advisories. Continuing without an upgrade assessment.'
    )
  }
}
