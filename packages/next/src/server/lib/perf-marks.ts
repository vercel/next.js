// Gated performance marks for SSR profiling.
// Zero overhead when NEXT_PERF_MARKS is not set: the module-level boolean
// check means the function body is a no-op in production.

const enabled = !!process.env.NEXT_PERF_MARKS

/**
 * Record a high-resolution performance mark.
 * Only active when the NEXT_PERF_MARKS environment variable is set.
 *
 * Note: marks are global and not request-scoped. Phase timing is only
 * accurate at concurrency=1. At higher concurrency, use throughput
 * metrics instead.
 */
export function perfMark(name: string): void {
  if (enabled) {
    performance.mark(name)
  }
}
