import type { AsyncLocalStorage } from 'async_hooks'
import { createAsyncLocalStorage } from '../../app-render/async-local-storage'
import type { RequestInsights } from './request-insights'

// The carrier is shared by CJS and ESM copies of the server runtime. It only
// identifies the controller that owns the current async request scope; retained
// insights and subscribers always live on that controller instance.
const REQUEST_INSIGHTS_RUNTIME_STORAGE_KEY = Symbol.for(
  '@next/request-insights-runtime-storage'
)

type RequestInsightsRuntimeScope = {
  requestInsights: RequestInsights | undefined
}

type GlobalWithRequestInsightsRuntimeStorage = typeof globalThis & {
  [REQUEST_INSIGHTS_RUNTIME_STORAGE_KEY]?: AsyncLocalStorage<RequestInsightsRuntimeScope>
}

function getExistingRequestInsightsRuntimeStorage():
  | AsyncLocalStorage<RequestInsightsRuntimeScope>
  | undefined {
  return (globalThis as GlobalWithRequestInsightsRuntimeStorage)[
    REQUEST_INSIGHTS_RUNTIME_STORAGE_KEY
  ]
}

function getOrCreateRequestInsightsRuntimeStorage(): AsyncLocalStorage<RequestInsightsRuntimeScope> {
  const globalWithStorage =
    globalThis as GlobalWithRequestInsightsRuntimeStorage

  return (globalWithStorage[REQUEST_INSIGHTS_RUNTIME_STORAGE_KEY] ??=
    createAsyncLocalStorage<RequestInsightsRuntimeScope>())
}

export function runWithRequestInsights<T>(
  requestInsights: RequestInsights | undefined,
  fn: () => T
): T {
  if (!process.env.__NEXT_DEV_SERVER) {
    return fn()
  }

  const storage = getExistingRequestInsightsRuntimeStorage()
  if (!storage) {
    return requestInsights === undefined
      ? fn()
      : getOrCreateRequestInsightsRuntimeStorage().run({ requestInsights }, fn)
  }

  return storage.getStore()?.requestInsights === requestInsights
    ? fn()
    : storage.run({ requestInsights }, fn)
}

export function getActiveRequestInsights(): RequestInsights | undefined {
  if (!process.env.__NEXT_DEV_SERVER) {
    return undefined
  }

  return getExistingRequestInsightsRuntimeStorage()?.getStore()?.requestInsights
}

export function isRequestInsightsRuntimeActive(): boolean {
  return getActiveRequestInsights() !== undefined
}
