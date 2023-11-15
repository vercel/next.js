import { DetachedPromise } from './detached-promise'

type Options = {
  timeoutAfterMs: number
  onTimeout?: (err: Error) => never
}

/**
 * Races a promise to resolve with a timeout that will be cleared in the event
 * that the promise itself resolves or rejects.
 *
 * @param promise the promise to race with the timeout
 * @param options the options for the timeout
 * @returns
 */
export async function timeOutAfter<T = void>(
  promise: Promise<T>,
  { timeoutAfterMs, onTimeout }: Options
): Promise<T> {
  // This promise will be rejected if the timeout is reached.
  const detached = new DetachedPromise<never>()

  // This timeout will reject the promise if it is not aborted before the
  // timeout is reached.
  const timeout = setTimeout(() => {
    detached.reject(new Error(`Timed out after ${timeoutAfterMs}ms`))
  }, timeoutAfterMs)

  // Race the work promise and the timeout promise. If the work promise finishes
  // it will return the result and clear the timeout. If the timeout is reached
  // first, it will reject.
  const result = await Promise.race([
    promise.catch((err) => {
      // The work promise rejected. If we left this as is, we'd always have
      // the timer sitting around until the timeout was reached. Instead, we
      // clear the timeout and re-throw the error so that it can be handled
      // by the caller.
      clearTimeout(timeout)
      throw err
    }),
    detached.promise.catch((err) => {
      // The timeout was reached. If the caller provided a callback, call it.
      // Otherwise, re-throw the error so that it can be handled by the caller.
      if (onTimeout) {
        // TS requires a return here in order to propagate the `never` return
        // type of the callback.
        return onTimeout(err)
      } else {
        throw err
      }
    }) satisfies Promise<never>,
  ])

  clearTimeout(timeout)

  return result
}
