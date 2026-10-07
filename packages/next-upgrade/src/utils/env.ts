import { determineAgent } from '@vercel/detect-agent'
import ciEnvironment from 'ci-info'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'

let agentNamePromise: Promise<string | null> | undefined

/**
 * Detects the AI coding agent (if any) driving the current process and resolves
 * to its name, or `null` when no agent is detected. The result is memoized:
 * the agent cannot change over the lifetime of the process. Any detection
 * failure is treated as "no agent".
 */
export function getAgentName(): Promise<string | null> {
  if (!agentNamePromise) {
    agentNamePromise = determineAgent()
      .then((result) => (result.isAgent ? result.agent.name : null))
      .catch(() => null)
  }

  return agentNamePromise
}

// Matches Next.js' CI detection, including platforms ci-info doesn't know.
const isZeitNow = !!process.env.NOW_BUILDER
const envStack = process.env.STACK
const isHeroku =
  typeof envStack === 'string' && envStack.toLowerCase().includes('heroku')

export const isCI = isZeitNow || isHeroku || ciEnvironment.isCI

// Read the manifest at runtime instead of bundling it: release tooling sets
// the published version after the build.
function readUpgradeVersion(): string {
  let directory = __dirname
  while (true) {
    try {
      const manifest = JSON.parse(
        readFileSync(join(directory, 'package.json'), 'utf8')
      )
      if (
        manifest.name === '@next/upgrade' &&
        typeof manifest.version === 'string'
      ) {
        return manifest.version
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
    const parent = dirname(directory)
    if (parent === directory) {
      throw new Error('Could not determine the @next/upgrade version.')
    }
    directory = parent
  }
}

// The version of this package. It versions the guides, the codemods and the
// result reporter that an upgrade run uses.
export const upgradeVersion = readUpgradeVersion()
