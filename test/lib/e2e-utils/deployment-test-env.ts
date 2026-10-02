const deploymentTestFlags = [
  '__NEXT_CACHE_COMPONENTS',
  '__NEXT_PARTIAL_PREFETCHING',
  '__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS',
]

/**
 * Capture experimental test flags and restore the test-mode alias in the deployed
 * config because Vercel environment variable names cannot start with an
 * underscore. This runs in the local test harness.
 */
export function getDeploymentTestEnvAssignments(): string {
  let assignments = ''
  for (const flag of deploymentTestFlags) {
    const value = process.env[flag]
    if (value) {
      assignments += `process.env.${flag} = ${JSON.stringify(value)}\n`
    }
  }
  return (
    assignments +
    `
// Restore test mode from the alias supplied to the remote build.
if (process.env.NEXT_PRIVATE_TEST_MODE) {
  process.env.__NEXT_TEST_MODE = process.env.NEXT_PRIVATE_TEST_MODE
}
`
  )
}
