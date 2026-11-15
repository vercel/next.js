const deploymentTestFlags = [
  '__NEXT_CACHE_COMPONENTS',
  '__NEXT_PARTIAL_PREFETCHING',
  '__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS',
  '__NEXT_TEST_AXIS',
]

/**
 * Capture test flags in the deployed config because Vercel environment variable
 * names cannot start with an underscore. This runs in the local test harness.
 *
 * Callers insert the assignments before the config content. A fixture can read
 * a flag while its config module loads, for example
 * `process.env.__NEXT_TEST_AXIS !== 'A'`.
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
