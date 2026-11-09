// The ways in which the top-level code of a module can keep the async context that it is
// evaluated in.
const { AsyncLocalStorage, AsyncResource } = globalThis.deferAsyncHooks
const request = () => globalThis.deferRequest.getStore()

globalThis.deferEvents.push('context')

export const atEvaluation = request()

const snapshot = AsyncLocalStorage.snapshot()
const bound = AsyncResource.bind(request)
const timer = new Promise((resolve) => setTimeout(() => resolve(request()), 1))
const asyncFunction = (async () => {
  await null
  return request()
})()

export async function kept() {
  return {
    snapshot: snapshot(request),
    bound: bound(),
    timer: await timer,
    asyncFunction: await asyncFunction,
  }
}
