import type { AsyncLocalStorage } from 'async_hooks'
import type { RequestInsightKind } from '../../../next-devtools/shared/request-insights'
import type {
  RequestInsightProxyStatus,
  RequestInsightRouterActivity,
  RequestInsightSource,
} from '../../../shared/lib/request-insights'
import { createAsyncLocalStorage } from '../../app-render/async-local-storage'
import {
  getValidatedDevHtmlRequestId,
  getValidatedDevRequestId,
} from '../dev-request-id'

export type RequestInsightsIdentity = {
  // This is a server-owned storage key. Browser-provided IDs are only used by
  // the development debug channel and must never become Request Insights keys.
  requestId: string
  debugRequestId?: string
  kind?: RequestInsightKind
  source?: RequestInsightSource
  proxyStatus?: RequestInsightProxyStatus
  routerActivity?: RequestInsightRouterActivity
  serverAction?: true
  htmlRequestId: string
  url: string | undefined
}

export function resolveRequestInsightsIdentity({
  previousIdentity,
  requestIdHeader,
  htmlRequestIdHeader,
  url,
  createRequestId,
}: {
  previousIdentity: RequestInsightsIdentity | undefined
  requestIdHeader: string | string[] | undefined
  htmlRequestIdHeader: string | string[] | undefined
  url: string | undefined
  createRequestId: () => string
}): RequestInsightsIdentity {
  if (previousIdentity) {
    return previousIdentity
  }

  const requestId = createRequestId()
  return {
    requestId,
    debugRequestId: getValidatedDevRequestId(requestIdHeader),
    htmlRequestId:
      getValidatedDevHtmlRequestId(htmlRequestIdHeader) ?? requestId,
    url,
  }
}

// This storage covers the part of BaseServer request handling that runs before
// App Render creates workAsyncStorage. Once available, workStore remains the
// primary identity source for locally recorded spans.
const REQUEST_INSIGHTS_IDENTITY_STORAGE_KEY = Symbol.for(
  '@next/request-insights-identity-storage'
)

type RequestInsightsIdentityScope = {
  identity: RequestInsightsIdentity | undefined
}

type GlobalWithRequestInsightsIdentityStorage = typeof globalThis & {
  [REQUEST_INSIGHTS_IDENTITY_STORAGE_KEY]?: AsyncLocalStorage<RequestInsightsIdentityScope>
}

function getExistingRequestInsightsIdentityStorage():
  | AsyncLocalStorage<RequestInsightsIdentityScope>
  | undefined {
  return (globalThis as GlobalWithRequestInsightsIdentityStorage)[
    REQUEST_INSIGHTS_IDENTITY_STORAGE_KEY
  ]
}

function getOrCreateRequestInsightsIdentityStorage(): AsyncLocalStorage<RequestInsightsIdentityScope> {
  const globalStore = globalThis as GlobalWithRequestInsightsIdentityStorage

  return (globalStore[REQUEST_INSIGHTS_IDENTITY_STORAGE_KEY] ??=
    createAsyncLocalStorage<RequestInsightsIdentityScope>())
}

export function runWithRequestInsightsIdentity<T>(
  identity: RequestInsightsIdentity | undefined,
  fn: () => T
): T {
  if (!process.env.__NEXT_DEV_SERVER) {
    return fn()
  }

  const storage = getExistingRequestInsightsIdentityStorage()
  if (!storage) {
    return identity === undefined
      ? fn()
      : getOrCreateRequestInsightsIdentityStorage().run({ identity }, fn)
  }

  return storage.getStore()?.identity === identity
    ? fn()
    : storage.run({ identity }, fn)
}

export function getRequestInsightsIdentity():
  | RequestInsightsIdentity
  | undefined {
  if (!process.env.__NEXT_DEV_SERVER) {
    return undefined
  }

  return getExistingRequestInsightsIdentityStorage()?.getStore()?.identity
}
