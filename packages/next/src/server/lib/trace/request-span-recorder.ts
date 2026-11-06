import type { AttributeValue } from '@opentelemetry/api'
import {
  createLocalSpan,
  getActiveLocalSpan,
  getLocalParentSpan,
  getOpenTelemetrySpan,
  getToolingSpanSource,
  isLocalRecordingSpan,
  isOpenTelemetryIsolatedSpan,
  traceLocalSpan,
  withLocalSpan,
  type LocalSpanOptions,
  type LocalRecordingSpan,
} from './local-span-recorder'
import {
  captureLocalSpanRecorder,
  isLocalSpanRecordingEnabled,
  isLocalSpanSinkActive,
  type SpanStoreRecord,
} from './span-store'

type RequestSpanOptions = Omit<
  LocalSpanOptions,
  'attributes' | 'monotonicStartTime' | 'wallStartTimeMs'
> & {
  attributes?: Partial<Record<string, AttributeValue | undefined>>
}

/** Request policy is bound here, not inferred by the shared local recorder. */
export function createRequestSpan(
  options: RequestSpanOptions
): LocalRecordingSpan {
  const identity = getCurrentRequestIdentity()
  const deliver = captureLocalSpanRecorder()
  return createLocalSpan(
    { ...options, isolateOpenTelemetry: options.isolateOpenTelemetry ?? false },
    (spans) => {
      // The recorder creates these records for this delivery callback alone.
      // Enrich before publishing, without another array or record allocation.
      for (const span of spans) {
        span.requestId = identity.requestId
        span.requestInsightKind = identity.requestInsightKind
        span.requestInsightSource = identity.requestInsightSource
        span.requestInsightProxyStatus = identity.requestInsightProxyStatus
        span.htmlRequestId = identity.htmlRequestId
        span.route ??= identity.route
        span.url ??= identity.url
      }
      deliver(spans)
    }
  )
}

// Validation operations deliberately isolate local context from the app SDK.
// Only request callbacks inherit an active request parent and establish scope.
export function traceRequestSpan<T>(
  options: RequestSpanOptions & { synchronous: true },
  fn: (span: LocalRecordingSpan) => T
): T
export function traceRequestSpan<T>(
  options: RequestSpanOptions & { synchronous?: false },
  fn: (span: LocalRecordingSpan) => T | Promise<T>
): Promise<T>
export function traceRequestSpan<T>(
  options: RequestSpanOptions & { synchronous?: boolean },
  fn: (span: LocalRecordingSpan) => T | Promise<T>
): T | Promise<T> {
  const run = () => {
    const active =
      options.parent === undefined ? getActiveLocalSpan() : undefined
    const parent =
      active && !getToolingSpanSource(active) ? active : options.parent
    const span = createRequestSpan({
      ...options,
      parent,
      isolateOpenTelemetry: true,
    })
    const execute = () => withLocalSpan(span, () => fn(span))
    return options.synchronous
      ? traceLocalSpan({ span, synchronous: true }, execute)
      : traceLocalSpan({ span }, execute)
  }
  // Preserve the asynchronous default, including errors during creation.
  return options.synchronous ? run() : (async () => run())()
}

export type LocalSpanRecorder = {
  createLocalSpan: typeof createRequestSpan
  getActiveLocalSpan: typeof getActiveLocalSpan
  getLocalParentSpan: typeof getLocalParentSpan
  getOpenTelemetrySpan: typeof getOpenTelemetrySpan
  isLocalRecordingSpan: typeof isLocalRecordingSpan
  isOpenTelemetryIsolatedSpan: typeof isOpenTelemetryIsolatedSpan
  isLocalSpanRecordingEnabled: typeof isLocalSpanRecordingEnabled
  isLocalSpanSinkActive: typeof isLocalSpanSinkActive
  traceLocalSpan: typeof traceRequestSpan
  withLocalSpan: typeof withLocalSpan
}

// Bundled tracer copies reach this externalized request integration without
// sharing request state globally. Only these functions are registered.
const LOCAL_SPAN_RECORDER_KEY = Symbol.for(
  `@next/local-span-recorder@${process.env.__NEXT_VERSION}`
)
type GlobalWithLocalSpanRecorder = typeof globalThis & {
  [LOCAL_SPAN_RECORDER_KEY]?: LocalSpanRecorder
}
export function registerLocalSpanRecorder({
  sinkOnly = false,
}: { sinkOnly?: boolean } = {}): void {
  ;(globalThis as GlobalWithLocalSpanRecorder)[LOCAL_SPAN_RECORDER_KEY] = {
    createLocalSpan: createRequestSpan,
    getActiveLocalSpan,
    getLocalParentSpan,
    getOpenTelemetrySpan,
    isLocalRecordingSpan,
    isOpenTelemetryIsolatedSpan,
    isLocalSpanRecordingEnabled: sinkOnly
      ? isLocalSpanSinkActive
      : isLocalSpanRecordingEnabled,
    isLocalSpanSinkActive,
    traceLocalSpan: traceRequestSpan,
    withLocalSpan,
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
