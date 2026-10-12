import { determineAgent } from 'next/dist/compiled/@vercel/detect-agent'

let agentNamePromise: Promise<string | null> | undefined

/**
 * Detects the AI coding agent (if any) driving the current process and resolves
 * to its name, or `null` when no agent is detected.
 *
 * Detection is delegated to `@vercel/detect-agent`, which performs an async
 * filesystem probe (e.g. for Devin) in addition to environment-variable checks,
 * so it can be relatively expensive. The detected agent cannot change over the
 * lifetime of the process, so we memoize the promise: the first call runs
 * detection once, and every subsequent call resolves against the already
 * settled promise. Any detection failure is treated as "no agent" so telemetry
 * never throws on this path.
 */
export function getAgentName(): Promise<string | null> {
  if (!agentNamePromise) {
    agentNamePromise = determineAgent()
      .then((result) => (result.isAgent ? result.agent.name : null))
      .catch(() => null)
  }

  return agentNamePromise
}
