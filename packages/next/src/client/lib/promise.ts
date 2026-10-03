import { requestIdleCallback } from '../request-idle-callback'

// 3.8s was arbitrarily chosen as it's what https://web.dev/interactive
// considers as "Good" time-to-interactive. We must assume something went
// wrong beyond this point, and then fall-back to a full page transition to
// show the user something of value.
const MS_MAX_IDLE_DELAY = 3800

/**
 * Resolve `p` within `MS_MAX_IDLE_DELAY` ms or reject with `err`.
 *
 * The timeout countdown only starts once `delayPromise` settles. This extends
 * the deadline while known external work, such as chunk downloads or a
 * development build, is still in progress.
 */
export function resolvePromiseWithTimeout<T>(
  p: Promise<T>,
  err: Error,
  delayPromise: Promise<unknown> | undefined
): Promise<T> {
  return new Promise((resolve, reject) => {
    let cancelled = false

    p.then((r) => {
      // Resolved, cancel the timeout
      cancelled = true
      resolve(r)
    }).catch(reject)

    const scheduleTimeout = () =>
      requestIdleCallback(() =>
        setTimeout(() => {
          if (!cancelled) {
            reject(err)
          }
        }, MS_MAX_IDLE_DELAY)
      )

    // Start the timer once the delay settles, regardless of its outcome. If
    // there is no delay, start it immediately.
    ;(delayPromise || Promise.resolve()).then(scheduleTimeout, scheduleTimeout)
  })
}
