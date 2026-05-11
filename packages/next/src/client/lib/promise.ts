import { requestIdleCallback } from '../request-idle-callback'

// 3.8s was arbitrarily chosen as it's what https://web.dev/interactive
// considers as "Good" time-to-interactive. We must assume something went
// wrong beyond this point, and then fall-back to a full page transition to
// show the user something of value.
const MS_MAX_IDLE_DELAY = 3800

/**
 * Resolve `p` within `MS_MAX_IDLE_DELAY` ms or reject with `err`.
 *
 * The timeout countdown only starts once `delayPromise` settles. This is
 * used to extend the deadline while we know external work (e.g. chunk
 * downloads, a development build) is still in progress.
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

    // We don't care about whether `delayPromise` resolved or rejected --
    // start the timer either way once it settles. If `delayPromise` is
    // omitted, start the timer immediately.
    ;(delayPromise || Promise.resolve()).then(scheduleTimeout, scheduleTimeout)
  })
}
