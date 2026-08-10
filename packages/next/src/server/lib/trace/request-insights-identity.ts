import type { AsyncLocalStorage } from 'async_hooks'
import type { RequestInsightKind } from '../../../next-devtools/shared/request-insights'
import type {
  RequestInsightProxyStatus,
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
