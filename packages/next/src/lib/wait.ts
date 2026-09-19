/**
 * Wait for a given number of milliseconds and then resolve.
 *
 * This is the canonical sleep helper: prefer it over hand-rolling
 * `new Promise((resolve) => setTimeout(resolve, ms))`, which the
 * `@next/internal/no-adhoc-sleep` lint rule flags.
 *
 * @param ms the number of milliseconds to wait
 */
export async function wait(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
