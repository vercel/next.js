import type { ExperimentConfig } from '@vercel/agent-eval'
import { setupUpgrade } from './fixture'
import { setupSecurity } from '../security/setup'
import { setupLatest } from '../latest/setup'
import { setupFuture } from '../future/setup'

export function upgradeExperiment(
  harness: 'codex' | 'claude-code'
): ExperimentConfig {
  const fixture = process.env.NEXT_UPGRADE_EVAL_CASE
  if (!fixture) throw new Error('Select one upgrade eval case')
  const security = fixture.startsWith('security-')
  const latest = fixture.startsWith('latest-')
  const future = fixture.startsWith('future-')

  return {
    agent: `vercel-ai-gateway/${harness}`,
    model: harness === 'codex' ? 'openai/gpt-5.6-terra' : 'claude-sonnet-4-6',
    judge: {
      agent: 'vercel-ai-gateway/claude-code',
      model: 'claude-haiku-4-5',
    },
    evals: fixture,
    earlyExit: false,
    timeout: future ? 3600 : 1800,
    copyFiles: 'changed',
    setup: async (sandbox) => {
      const setup = await setupUpgrade(sandbox)
      if (security) await setupSecurity(sandbox)
      if (latest) await setupLatest(sandbox)
      if (future) await setupFuture(sandbox)
      return setup
    },
  }
}
