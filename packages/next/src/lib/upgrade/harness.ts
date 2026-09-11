import { getAgentName } from '../../telemetry/agent-name'

export type UpgradeHarness = 'codex' | 'claude'
export type HarnessChoice =
  | { kind: 'handoff'; harness: UpgradeHarness }
  | { kind: 'fallback'; reason: string }

export function selectHarness(active: string | null): HarnessChoice {
  if (active === 'codex' || active === 'claude' || active === 'claude-code') {
    return {
      kind: 'handoff',
      harness: active === 'claude-code' ? 'claude' : active,
    }
  }
  return {
    kind: 'fallback',
    reason: active
      ? `The active harness (${active}) is not supported. Continue in Codex or Claude Code.`
      : 'Open Codex or Claude Code, then follow the printed instructions.',
  }
}

export async function handoffUpgrade(prompt: string): Promise<void> {
  const choice = selectHarness(await getAgentName())
  if (choice.kind === 'fallback') {
    console.log(choice.reason)
    process.exitCode = 1
  }
  console.log(prompt)
}
