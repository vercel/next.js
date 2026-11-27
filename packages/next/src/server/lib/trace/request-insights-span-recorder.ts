import type { LocalSpanDelivery } from './local-span-recorder'
import {
  SPAN_STATUS_ERROR,
  cleanSpanStoreAttributes,
  getSpanStoreLinks,
} from './span-attributes'
import { captureLocalSpanRecorder, type SpanStoreRecord } from './span-store'
import type { OpenTelemetryReadableSpan } from './request-insights-otel'
import { getTimestamp, hrTimeToMilliseconds } from './utils'

export type RequestIdentity = ReturnType<typeof getCurrentRequestIdentity>
function applyRequestIdentity(
  record: SpanStoreRecord,
  identity: RequestIdentity
) {
  record.requestId = identity.requestId
  record.parentRequestId = identity.parentRequestId
  record.requestInsightKind = identity.requestInsightKind
  record.requestInsightSource = identity.requestInsightSource
  record.requestInsightProxyStatus = identity.requestInsightProxyStatus
  record.htmlRequestId = identity.htmlRequestId
  record.route ??= identity.route
  record.url ??= identity.url
}

export function captureRequestSpanRecorder(
  identity: RequestIdentity = getCurrentRequestIdentity()
): LocalSpanDelivery {
  const deliver = captureLocalSpanRecorder()
  return (recording, end) => {
    const span = recording.toSpanStoreRecord(end)
    applyRequestIdentity(span, identity)
    deliver([span])
  }
}

export function captureOpenTelemetrySpanRecorder():
  | ((span: OpenTelemetryReadableSpan) => void)
  | undefined {
  const identity = getCurrentRequestIdentity()
  if (!identity.requestId) {
    return undefined
  }

  const deliver = captureLocalSpanRecorder()
  return (span) => {
    const { traceId, spanId } = span.spanContext()
    const isError = span.status.code === SPAN_STATUS_ERROR
    const record: SpanStoreRecord = {
      timestamp: getTimestamp(),
      name: span.name,
      category: 'opentelemetry',
      startTime: hrTimeToMilliseconds(span.startTime),
      durationMs: hrTimeToMilliseconds(span.duration),
      status: isError ? 'error' : 'ok',
      traceId,
      spanId,
      parentSpanId: span.parentSpanContext?.spanId ?? span.parentSpanId,
      attributes: cleanSpanStoreAttributes(span.attributes),
      events: span.events.length
        ? span.events.map((event) => ({
            name: event.name,
            timestamp: hrTimeToMilliseconds(event.time),
            attributes: cleanSpanStoreAttributes(event.attributes),
          }))
        : undefined,
      links: getSpanStoreLinks(span.links),
      error:
        isError && span.status.message
          ? { message: span.status.message }
          : undefined,
    }
    applyRequestIdentity(record, identity)
    deliver([record])
  }
}

export function getCurrentRequestIdentity(): Pick<
  SpanStoreRecord,
  | 'requestId'
  | 'parentRequestId'
  | 'requestInsightKind'
  | 'requestInsightSource'
  | 'requestInsightProxyStatus'
  | 'htmlRequestId'
  | 'route'
  | 'url'
> {
  // Required lazily: these modules create AsyncLocalStorage on load, which
  // throws before node-environment installs it (e.g. during CLI startup spans).
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
      parentRequestId: requestInsightsIdentity?.parentRequestId,
      requestInsightKind: requestInsightsIdentity?.kind,
      requestInsightSource: requestInsightsIdentity?.source,
      requestInsightProxyStatus: requestInsightsIdentity?.proxyStatus,
      htmlRequestId:
        requestInsightsIdentity?.htmlRequestId ?? workStore?.htmlRequestId,
      url: url ? `${url.pathname}${url.search}` : requestInsightsIdentity?.url,
    }
  } catch {
    return {}
  }
}
