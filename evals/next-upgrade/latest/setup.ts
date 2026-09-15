import { join } from 'node:path'
import type { Sandbox } from '@vercel/agent-eval'
import { setupUpgradeScenario } from '../security/setup'

export async function setupLatest(sandbox: Sandbox) {
  const fixture = process.env.NEXT_UPGRADE_EVAL_CASE
  const target = '16.3.5'
  const scenarios: Record<string, { target: string }> = {
    'latest-cross-major': { target },
    'latest-same-major': { target },
  }
  const scenario = fixture ? scenarios[fixture] : undefined
  if (!scenario) throw new Error('Unknown latest upgrade eval case')

  await setupUpgradeScenario(sandbox, {
    fixturePrefix: 'latest-',
    assessmentPath: join(__dirname, 'assessment.mjs'),
    assessment: scenario,
    installedVersion: undefined,
  })
}
