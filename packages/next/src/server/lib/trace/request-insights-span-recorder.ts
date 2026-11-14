import type { LocalSpanDelivery } from './local-span-recorder'
import { captureLocalSpanRecorder, type SpanStoreRecord } from './span-store'

type RequestSpanIdentity = ReturnType<typeof getCurrentRequestIdentity>
function applyRequestIdentity(
  record: SpanStoreRecord,
  identity: RequestSpanIdentity
) {
  record.requestId = identity.requestId
  record.requestInsightKind = identity.requestInsightKind
  record.requestInsightSource = identity.requestInsightSource
  record.requestInsightProxyStatus = identity.requestInsightProxyStatus
  record.htmlRequestId = identity.htmlRequestId
  record.route ??= identity.route
  record.url ??= identity.url
}

export function captureRequestSpanRecorder(
  identity: RequestSpanIdentity = getCurrentRequestIdentity()
): LocalSpanDelivery {
  const deliver = captureLocalSpanRecorder()
  return (recording, end) => {
    const span = recording.toSpanStoreRecord(end)
    applyRequestIdentity(span, identity)
    deliver([span])
  }
}

function getCurrentRequestIdentity(): Pick<
  SpanStoreRecord,
  | 'requestId'
  | 'requestInsightKind'
  | 'requestInsightSource'
  | 'requestInsightProxyStatus'
  | 'htmlRequestId'
  | 'route'
  | 'url'
> {
  try {
    const { getRequestInsightsIdentity } =
      require('./request-insights-identity') as typeof import('./request-insights-identity')
    const { workAsyncStorage } =
      require('../../app-render/work-async-storage.external') as typeof import('../../app-render/work-async-storage.external')
    const { workUnitAsyncStorage } =
      require('../../app-render/work-unit-async-storage.external') as typeof import('../../app-render/work-unit-async-storage.external')
    const workStore = workAsyncStorage.getStore()
    const workUnitStore = workUnitAsyncStorage.getStore()
    const requestInsightsIdentity = getRequestInsightsIdentity()
    const url =
      workUnitStore && 'url' in workUnitStore ? workUnitStore.url : undefined
    return {
      requestId: requestInsightsIdentity?.requestId ?? workStore?.requestId,
      requestInsightKind: requestInsightsIdentity?.kind,
      requestInsightSource: requestInsightsIdentity?.source,
      requestInsightProxyStatus: requestInsightsIdentity?.proxyStatus,
      htmlRequestId:
        requestInsightsIdentity?.htmlRequestId ?? workStore?.htmlRequestId,
      route: workStore?.route,
      url: url ? `${url.pathname}${url.search}` : requestInsightsIdentity?.url,
    }
  } catch {
    return {}
  }
}
