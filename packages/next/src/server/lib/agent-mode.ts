import { getAgentName } from '../../telemetry/agent-name'

/**
 * Experimental agent mode (`experimental.agentMode`).
 *
 * When enabled AND an AI coding agent is detected driving this process (via
 * `@vercel/detect-agent`), the dev server adapts surfaces that agents hit with
 * their existing habits so they discover the structured tooling instead:
 *
 * - CLI HTTP clients (curl/wget) fetching rendered routes get a JSON
 *   interception response pointing at `/_next/agent` and `/_next/mcp`.
 * - `GET /_next/agent` serves a machine-readable index of this dev server
 *   (project path, MCP endpoint and tool names).
 * - A second `next dev` for the same project explains how to reuse the
 *   running server instead of suggesting `kill <pid>` first.
 * - `next build` warns when a dev server for the project is already running
 *   and per-route validation via MCP would be cheaper than a full build.
 *
 * Activation requires BOTH the flag and a detected agent:
 *
 * - `experimental.agentMode: true` in next.config, or
 *   `__NEXT_EXPERIMENTAL_AGENT_MODE=true` (see `config.ts`), AND
 * - `@vercel/detect-agent` detects an agent session.
 *
 * For testing and evals, `__NEXT_EXPERIMENTAL_AGENT_MODE=force` additionally
 * bypasses agent detection.
 */

/**
 * Sync check: is the agent-mode flag set (config or env)? Does NOT include
 * agent detection — use this only to decide whether to mount handlers whose
 * responses themselves await `isAgentModeEnabled`.
 */
export function isAgentModeConfigured(config: {
  experimental?: { agentMode?: boolean }
}): boolean {
  if (config.experimental?.agentMode === true) return true
  const env = process.env.__NEXT_EXPERIMENTAL_AGENT_MODE
  return env === 'true' || env === 'force'
}

let agentModePromise: Promise<boolean> | undefined

/**
 * Resolves whether agent mode is active for this process: the flag is set and
 * an AI coding agent is detected (or detection is bypassed with
 * `__NEXT_EXPERIMENTAL_AGENT_MODE=force`).
 *
 * Memoized: neither the flag nor the detected agent can change over the
 * lifetime of the process, and detection includes a filesystem probe.
 */
export function isAgentModeEnabled(config: {
  experimental?: { agentMode?: boolean }
}): Promise<boolean> {
  if (!agentModePromise) {
    agentModePromise = (async () => {
      if (!isAgentModeConfigured(config)) return false
      if (process.env.__NEXT_EXPERIMENTAL_AGENT_MODE === 'force') return true
      return (await getAgentName()) !== null
    })()
  }
  return agentModePromise
}
