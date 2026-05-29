// NOTE: This file duplicates the detection helper added in
// https://github.com/vercel/next.js/pull/91854 (branch: imm/agent-telemetry).
// When that PR lands, whichever branch merges second should collapse the
// duplicate — the contents are intentionally identical so the merge is a
// no-op. The env variable checks mirror the same functionality in the
// `vercel` CLI.

export type AgentName =
  | 'cursor'
  | 'cursor-cli'
  | 'claude'
  | 'cowork'
  | 'devin'
  | 'replit'
  | 'gemini'
  | 'codex'
  | 'antigravity'
  | 'augment-cli'
  | 'opencode'
  | 'github-copilot'

export function detectAgent(): AgentName | null {
  if (process.env.AI_AGENT) {
    const name = process.env.AI_AGENT.trim()
    if (name) {
      const normalized = name === 'github-copilot-cli' ? 'github-copilot' : name
      return normalized as AgentName
    }
  }

  if (process.env.CURSOR_TRACE_ID) {
    return 'cursor'
  }

  if (process.env.CURSOR_AGENT) {
    return 'cursor-cli'
  }

  if (process.env.GEMINI_CLI) {
    return 'gemini'
  }

  if (
    process.env.CODEX_SANDBOX ||
    process.env.CODEX_CI ||
    process.env.CODEX_THREAD_ID
  ) {
    return 'codex'
  }

  if (process.env.ANTIGRAVITY_AGENT) {
    return 'antigravity'
  }

  if (process.env.AUGMENT_AGENT) {
    return 'augment-cli'
  }

  if (process.env.OPENCODE_CLIENT) {
    return 'opencode'
  }

  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE) {
    if (process.env.CLAUDE_CODE_IS_COWORK) {
      return 'cowork'
    }
    return 'claude'
  }

  if (process.env.REPL_ID) {
    return 'replit'
  }

  if (
    process.env.COPILOT_MODEL ||
    process.env.COPILOT_ALLOW_ALL ||
    process.env.COPILOT_GITHUB_TOKEN
  ) {
    return 'github-copilot'
  }

  return null
}
