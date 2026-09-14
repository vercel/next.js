import * as Log from '../../build/output/log'
import { getAgentName } from '../../telemetry/agent-name'
import { bold } from '../picocolors'

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
        `Run \`next upgrade ${JSON.stringify(directory)} --agentic\` to automatically upgrade the application.` +
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
