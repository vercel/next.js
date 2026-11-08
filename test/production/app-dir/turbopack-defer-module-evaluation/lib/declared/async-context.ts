import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks'
import { requestStore } from '../request-store'

// The ways in which the top-level code of a module can keep the async context that it is
// evaluated in.
const request = () => requestStore.getStore() ?? null

const atEvaluation = request()
const snapshot = AsyncLocalStorage.snapshot()
const bound = AsyncResource.bind(request)
const timer = new Promise<string | null>((resolve) =>
  setTimeout(() => resolve(request()), 1)
)
const asyncFunction = (async () => {
  await null
  return request()
})()

export async function kept() {
  return {
    atEvaluation,
    snapshot: snapshot(request),
    bound: bound(),
    timer: await timer,
    asyncFunction: await asyncFunction,
  }
}
