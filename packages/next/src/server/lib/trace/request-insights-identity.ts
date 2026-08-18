import type { AsyncLocalStorage } from 'async_hooks'
import type { RequestInsightKind } from '../../../next-devtools/shared/request-insights'
import { getOrCreateGlobalAsyncLocalStorage } from '../../app-render/async-local-storage'

export type RequestInsightsIdentity = {
  requestId: string
  kind?: RequestInsightKind
  htmlRequestId: string
  url: string | undefined
}

// This storage covers the part of BaseServer request handling that runs before
// App Render creates workAsyncStorage. Once available, workStore remains the
// primary identity source for locally recorded spans.
function getRequestInsightsIdentityStorage(): AsyncLocalStorage<RequestInsightsIdentity> {
  return getOrCreateGlobalAsyncLocalStorage('request-insights-identity-storage')
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
