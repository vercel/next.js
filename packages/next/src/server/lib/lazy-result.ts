export type LazyResult<TValue> = PromiseLike<TValue> & { value?: TValue }
export type ResolvedLazyResult<TValue> = PromiseLike<TValue> & { value: TValue }

/**
 * Calls the given async function only when the returned promise-like object is
 * awaited. Afterwards, it provides the resolved value synchronously as `value`
 * property.
 */
export function createLazyResult<TValue>(
  fn: () => Promise<TValue>
): LazyResult<TValue> {
  let pendingResult: Promise<TValue> | undefined

  const result: LazyResult<TValue> = {
    then(onfulfilled, onrejected) {
      if (!pendingResult) {
        pendingResult = fn()
      }

      pendingResult
        .then((value) => {
          result.value = value
        })
        .catch(() => {
          // The externally awaited result will be rejected via `onrejected`. We
          // don't need to handle it here. But we do want to avoid an unhandled
          // rejection.
        })

      return pendingResult.then(onfulfilled, onrejected)
    },
  }

  return result
}

export function isResolvedLazyResult<TValue>(
  result: LazyResult<TValue>
): result is ResolvedLazyResult<TValue> {
  return result.hasOwnProperty('value')
}
