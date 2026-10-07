import { getAgentName, isCI } from './utils/env'

// The terminal test needs a menu in CI and under agents, without the network.
export function isTerminalForcedForTesting(): boolean {
  return process.env.__NEXT_AGENT_UPGRADE_FORCE_TERMINAL_FOR_TESTING === '1'
}

export function canPromptForUpgrade(): boolean {
  return (
    (!isCI || isTerminalForcedForTesting()) &&
    Boolean(process.stdin.isTTY && process.stdout.isTTY) &&
    process.env.TERM !== 'dumb'
  )
}

export async function shouldPromptForUpgrade(): Promise<boolean> {
  return (
    canPromptForUpgrade() &&
    (isTerminalForcedForTesting() || !(await getAgentName()))
  )
}
