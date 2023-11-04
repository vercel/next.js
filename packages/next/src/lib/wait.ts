/**
 * Wait for a given number of milliseconds and then resolve.
 *
 * @param ms the number of milliseconds to wait
 */
export async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
