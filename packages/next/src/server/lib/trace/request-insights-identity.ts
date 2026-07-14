import type { AsyncLocalStorage } from 'async_hooks'
import { createAsyncLocalStorage } from '../../app-render/async-local-storage'

export type RequestInsightsIdentity = {
  requestId: string
  htmlRequestId: string
  url: string | undefined
}

const REQUEST_INSIGHTS_IDENTITY_STORAGE_KEY = Symbol.for(
  '@next/request-insights-identity-storage'
)

function getRequestInsightsIdentityStorage(): AsyncLocalStorage<RequestInsightsIdentity> {
  const globalStore = globalThis as typeof globalThis & {
    [REQUEST_INSIGHTS_IDENTITY_STORAGE_KEY]?: AsyncLocalStorage<RequestInsightsIdentity>
  }

  return (globalStore[REQUEST_INSIGHTS_IDENTITY_STORAGE_KEY] ??=
    createAsyncLocalStorage())
}

export function runWithRequestInsightsIdentity<T>(
  identity: RequestInsightsIdentity,
  fn: () => T
): T {
  return getRequestInsightsIdentityStorage().run(identity, fn)
}

export function getRequestInsightsIdentity():
  | RequestInsightsIdentity
  | undefined {
  return getRequestInsightsIdentityStorage().getStore()
}
