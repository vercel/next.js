import { join } from 'node:path'
import type { Sandbox } from '@vercel/agent-eval'
import { setupUpgradeScenario } from '../security/setup'

export async function setupFuture(sandbox: Sandbox) {
  const fixture = process.env.NEXT_UPGRADE_EVAL_CASE
  const scenarios: Record<string, { source: string; target: string }> = {
    future: {
      source: '13.5.11',
      target: '16.3.5',
    },
    'future-same-version': {
      source: '16.3.5',
      target: '16.3.5',
    },
    'future-nudge': {
      source: '16.3.5',
      target: '16.3.5',
    },
  }
  const scenario = fixture ? scenarios[fixture] : undefined
  if (!scenario) throw new Error('Unknown Future Defaults eval case')

  await setupUpgradeScenario(sandbox, {
    fixturePrefix: 'future',
    assessmentPath: join(__dirname, 'assessment.mjs'),
    assessment: scenario,
    installedVersion: undefined,
    candidateScripts: fixture === 'future-nudge' ? ['dev'] : undefined,
    skillSources:
      fixture === 'future-nudge'
        ? undefined
        : Object.fromEntries(
            [
              'next-cache-components-adoption',
              'next-partial-prefetching-adoption',
            ].map((skill) => [
              `https://github.com/vercel/next.js/tree/v${scenario.target}/skills/${skill}`,
              join(__dirname, '../../../skills', skill),
            ])
          ),
  })
}
