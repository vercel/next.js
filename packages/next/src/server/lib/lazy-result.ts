/**
 * Calls the given async function only when the returned promise-like object is
 * awaited.
 */
export function createLazyResult<TResult>(
  fn: () => Promise<TResult>
): PromiseLike<TResult> {
  let pendingResult: Promise<TResult> | undefined

  return {
    then(onfulfilled, onrejected) {
      if (!pendingResult) {
        pendingResult = fn()
      }

      return pendingResult.then(onfulfilled, onrejected)
    },
  }
}
