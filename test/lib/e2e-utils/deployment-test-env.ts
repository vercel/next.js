const deploymentTestFlags = [
  '__NEXT_CACHE_COMPONENTS',
  '__NEXT_PARTIAL_PREFETCHING',
  '__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS',
]

/**
 * Capture test flags in the deployed config because Vercel environment variable
 * names cannot start with an underscore. This runs in the local test harness.
 */
export function getDeploymentTestEnvAssignments(): string {
  let assignments = ''
  for (const flag of deploymentTestFlags) {
    const value = process.env[flag]
    if (value) {
      assignments += `process.env.${flag} = ${JSON.stringify(value)}\n`
    }
  }
  return assignments
}
