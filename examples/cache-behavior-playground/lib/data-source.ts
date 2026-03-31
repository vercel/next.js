/**
 * Simulated data source that tracks versions.
 * Used to verify cache behavior by checking if data is fresh or cached.
 */

let globalVersion = 0

export interface DataResult {
  timestamp: number
  random: number
  version: number
  instanceId: string
  source: string
  latencyMs: number
}

/**
 * Simulates fetching data with optional artificial latency.
 * Returns unique data each call to verify cache hits/misses.
 */
export async function fetchData(
  source: string,
  latencyMs = 100
): Promise<DataResult> {
  // Simulate network/database latency
  await new Promise((resolve) => setTimeout(resolve, latencyMs))

  globalVersion++

  return {
    timestamp: Date.now(),
    random: Math.random(),
    version: globalVersion,
    instanceId: getInstanceId(),
    source,
    latencyMs,
  }
}

/**
 * Get a stable instance identifier.
 * On Vercel: uses deployment ID
 * Self-hosted: uses process ID
 */
function getInstanceId(): string {
  if (process.env.VERCEL_DEPLOYMENT_ID) {
    return `vercel-${process.env.VERCEL_DEPLOYMENT_ID.slice(-8)}`
  }
  return `local-${process.pid}`
}

/**
 * Reset the version counter (for testing)
 */
export function resetVersion(): void {
  globalVersion = 0
}

/**
 * Get current version (for assertions)
 */
export function getCurrentVersion(): number {
  return globalVersion
}
