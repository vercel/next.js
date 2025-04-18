export function dedupeWhilePending<TResult = void>() {
  let promise: Promise<TResult> | null = null

  return {
    run: (func: () => Promise<TResult>): Promise<TResult> => {
      if (!promise) {
        promise = func()
        promise.finally(() => {
          promise = null
        })
      }
      return promise
    },
  }
}
