type CoalescedInvoke<T> = {
  isOrigin: boolean
  value: T
}

type UnwrapPromise<T> = T extends Promise<infer U> ? U : T

const globalInvokeCache = new Map<string, Promise<CoalescedInvoke<unknown>>>()

export function withCoalescedInvoke<F extends (...args: any) => any>(
  func: F
): (
  key: string,
  args: Parameters<F>
) => Promise<CoalescedInvoke<UnwrapPromise<ReturnType<F>>>> {
  return async function(key: string, args: Parameters<F>) {
    const entry = globalInvokeCache.get(key)
    if (entry) {
      return entry.then(res => ({
        isOrigin: false,
        value: res.value as UnwrapPromise<ReturnType<F>>,
      }))
    }

    async function __wrapper() {
      return await func.apply(undefined, args)
    }

    const future = __wrapper()
      .then(res => {
        globalInvokeCache.delete(key)
        return { isOrigin: true, value: res as UnwrapPromise<ReturnType<F>> }
      })
      .catch(err => {
        globalInvokeCache.delete(key)
        return Promise.reject(err)
      })
    globalInvokeCache.set(key, future)
    return future
  }
}
