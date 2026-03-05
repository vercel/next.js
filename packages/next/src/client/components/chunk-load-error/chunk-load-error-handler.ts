/**
 * Shared retry timing utilities for chunk and RSC request retries.
 */
// Retry budget after the initial attempt.
export const MAX_RETRY_ATTEMPTS = 1

const BASE_DELAY_MS = 200
const MAX_JITTER_MS = 400
const MAX_RTT_MS = 500
const MAX_TOTAL_DELAY_MS = 1500

/**
 * Calculate retry delay with jitter based on RTT.
 * Returns delay in milliseconds: 200 + random(0-400) + min(500, RTT), capped.
 */
export function getRetryDelayMs(): number {
  const jitter = Math.floor(Math.random() * (MAX_JITTER_MS + 1))

  // Get RTT if available via Network Information API
  let rtt = 0
  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const connection = (navigator as any).connection
    if (connection?.rtt) {
      rtt = Math.min(MAX_RTT_MS, connection.rtt)
    }
  }

  return Math.min(MAX_TOTAL_DELAY_MS, BASE_DELAY_MS + jitter + rtt)
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
