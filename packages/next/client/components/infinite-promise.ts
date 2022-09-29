/**
 * Used to cache in createInfinitePromise
 */
let infinitePromise: Promise<void>

/**
 * Create a Promise that does not resolve. This is used to suspend when data is not available yet.
 */
export function createInfinitePromise() {
  if (!infinitePromise) {
    // Only create the Promise once
    infinitePromise = new Promise((/* resolve */) => {
      // This is used to debug when the rendering is never updated.
      // setTimeout(() => {
      //   infinitePromise = new Error('Infinite promise')
      //   resolve()
      // }, 5000)
    })
  }

  return infinitePromise
}
