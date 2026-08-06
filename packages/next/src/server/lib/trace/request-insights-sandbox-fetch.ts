import {
  getRequestInsightsCausalTarget,
  isRequestInsightsSameOriginTarget,
  setRequestInsightsCausalCookie,
} from './request-insights-causal'
import type { RequestInsightsIdentity } from './request-insights-identity'
import type { RequestInsights } from './request-insights'
import { createRequestInsightsFetchInitSnapshot } from './request-insights-fetch-init'

export type RequestInsightsSandboxFetchContext = {
  identity: RequestInsightsIdentity
  origin?: string
  requestInsights: RequestInsights
}

export type RequestInsightsSandboxFetch = {
  init: RequestInit
  complete(response?: Pick<Response, 'status'>): void
}

const REQUEST_INSIGHTS_FETCH_INDEX = Symbol.for(
  '@next/request-insights-fetch-index'
)

type RequestInsightsFetchIdentity = RequestInsightsIdentity & {
  [REQUEST_INSIGHTS_FETCH_INDEX]?: number
}

// This allocator lives in the dev-only sandbox bridge rather than the identity
// module so its state and export cannot enter production server bundles.
export function getNextRequestInsightsFetchIndex(
  identity: RequestInsightsIdentity
): number {
  const fetchIdentity = identity as RequestInsightsFetchIdentity
  const index = fetchIdentity[REQUEST_INSIGHTS_FETCH_INDEX] ?? 1
  fetchIdentity[REQUEST_INSIGHTS_FETCH_INDEX] = index + 1
  return index
}

export function prepareRequestInsightsSandboxFetch({
  context,
  init: originalInit,
  url,
}: {
  context: RequestInsightsSandboxFetchContext
  init: RequestInit
  url: string
}): RequestInsightsSandboxFetch {
  const initSnapshot = createRequestInsightsFetchInitSnapshot(originalInit)
  const { init } = initSnapshot
  const fallback = { init, complete() {} }
  let causalToken: string | undefined

  try {
    const headers = initSnapshot.readHeaders()
    setRequestInsightsCausalCookie(headers, undefined)
    const targetUrl = new URL(url)
    const method = (initSnapshot.readString('method') ?? 'GET').toUpperCase()
    const fetchIndex = getNextRequestInsightsFetchIndex(context.identity)
    const target = getRequestInsightsCausalTarget(targetUrl, method)
    const origin = context.origin ?? context.identity.origin
    const credentials = initSnapshot.readString('credentials')

    causalToken =
      credentials !== 'omit' &&
      context.identity.kind !== 'instant-insights' &&
      context.identity.rootRequestId &&
      isRequestInsightsSameOriginTarget(origin, target) &&
      target
        ? context.requestInsights.mintCausalToken({
            parentRootRequestId: context.identity.rootRequestId,
            parentFetchIndex: fetchIndex,
            target,
          })
        : undefined

    if (causalToken && !setRequestInsightsCausalCookie(headers, causalToken)) {
      context.requestInsights.revokeCausalToken(causalToken)
      causalToken = undefined
    }

    const startTime = performance.timeOrigin + performance.now()
    let completed = false
    return {
      init,
      complete(response) {
        if (completed) return
        completed = true
        try {
          if (causalToken) {
            context.requestInsights.revokeCausalToken(causalToken)
          }
          const endTime = performance.timeOrigin + performance.now()
          context.requestInsights.recordFetch(context.identity, {
            url,
            method,
            statusCode: response?.status,
            startTime,
            durationMs: endTime - startTime,
            cacheStatus: 'skip',
            cacheReason: 'outside app render',
            index: fetchIndex,
          })
        } catch {
          // Request Insights bookkeeping must not affect fetch behavior.
        }
      },
    }
  } catch {
    if (causalToken) {
      try {
        context.requestInsights.revokeCausalToken(causalToken)
      } catch {}
    }
    return fallback
  }
}
