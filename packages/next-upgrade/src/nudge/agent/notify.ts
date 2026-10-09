import semver from 'semver'
import type { UpgradeReminder } from '../../shared/check-upgrade'

export function formatAgentNudge(reminder: UpgradeReminder, nudgeId: string) {
  let summary: string
  let recommendation: string
  let reference: string | null = null
  switch (reminder.kind) {
    case 'security':
      summary =
        'Your version of Next.js is affected by a known security vulnerability.'
      recommendation = 'We strongly recommend you upgrade Next.js.'
      reference = reminder.reference
      break
    case 'latest':
      summary = `Next.js ${reminder.latestVersion ?? '[latest version]'} is available. You're using ${reminder.installedVersion}.`
      recommendation = 'We recommend you upgrade Next.js.'
      reference = `https://registry.npmjs.org/next/${semver.prerelease(reminder.installedVersion)?.[0] === 'canary' ? 'canary' : 'latest'}`
      break
    case 'experimental-future':
      summary = `Installed Next.js ${reminder.installedVersion} includes Future Defaults available for this app:\n\n${reminder.names.map((name) => `- ${name}`).join('\n')}`
      recommendation = 'We recommend you adopt these Future Defaults.'
      break
  }
  // Pass attribution on the invocation using the same command syntax on every platform.
  const command = `next upgrade --agent=${reminder.policy} --internal-nudge-id=${nudgeId}`
  const message = `${summary}

**${recommendation}**

This command stopped to show the upgrade recommendation. Retry the same command to continue the original task.

When you report back to the user, include this upgrade recommendation even if the retry succeeds.

At the end of the task, ask the user once: "Would you like me to run the '${reminder.policy}' upgrade in the background in a separate Git worktree? I can use the current checkout if you prefer." If the app is not in Git, say it will run in place. Use their worktree choice and continue in this agent session. Run this command from this app's directory:

\`\`\`
${command}
\`\`\`

${reference ? `Reference: ${reference}` : ''}`
  return { summary, message, reference }
}
