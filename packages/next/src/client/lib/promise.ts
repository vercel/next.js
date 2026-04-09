import { requestIdleCallback } from '../request-idle-callback'

// 3.8s was arbitrarily chosen as it's what https://web.dev/interactive
// considers as "Good" time-to-interactive. We must assume something went
// wrong beyond this point, and then fall-back to a full page transition to
// show the user something of value.
const MS_MAX_IDLE_DELAY = 3800

/** Resolve a promise that times out after given amount of milliseconds. */
export function resolvePromiseWithTimeout<T>(
  p: Promise<T>,
  err: Error,
  devPromise: Promise<void> | undefined
): Promise<T> {
  return new Promise((resolve, reject) => {
    let cancelled = false

    p.then((r) => {
      // Resolved, cancel the timeout
      cancelled = true
      resolve(r)
    }).catch(reject)

    // We wrap these checks separately for better dead-code elimination in
    // production bundles.
    if (process.env.NODE_ENV === 'development') {
      ;(devPromise || Promise.resolve()).then(() => {
        requestIdleCallback(() =>
          setTimeout(() => {
            if (!cancelled) {
              reject(err)
            }
          }, MS_MAX_IDLE_DELAY)
        )
      })
    }

    if (process.env.NODE_ENV !== 'development') {
      requestIdleCallback(() =>
        setTimeout(() => {
          if (!cancelled) {
            reject(err)
          }
        }, MS_MAX_IDLE_DELAY)
      )
    }
  })
}
