import type { ExperimentConfig } from '@vercel/agent-eval'
import { setupUpgrade } from './fixture'

export function upgradeExperiment(
  harness: 'codex' | 'claude-code'
): ExperimentConfig {
  const fixture = process.env.NEXT_UPGRADE_EVAL_CASE
  if (!fixture) throw new Error('Select one upgrade eval case')

  return {
    agent: `vercel-ai-gateway/${harness}`,
    model: harness === 'codex' ? 'openai/gpt-5.6-terra' : 'claude-sonnet-4-6',
    judge: {
      agent: 'vercel-ai-gateway/claude-code',
      model: 'claude-haiku-4-5',
    },
    evals: fixture,
    earlyExit: false,
    timeout: 1800,
    copyFiles: 'changed',
    setup: setupUpgrade,
  }
}
