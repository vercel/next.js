import type { AttributeValue } from 'next/dist/compiled/@opentelemetry/api'
import type {
  RequestInsight,
  RequestInsightFetch,
  RequestInsightResponse,
  RequestInsightSpan,
  RequestInsightsCaptureState,
  RequestInsightsLiveSnapshot,
  RequestInsightsLiveUpdate,
  RequestInsightsSnapshot,
} from '../../../shared/lib/request-insights-data'
import {
  createBoundedRequestInsightsSnapshotProjection,
  createRequestInsightsByteLengthCache,
  REQUEST_INSIGHTS_ID_PATTERN,
  REQUEST_INSIGHTS_MAX_BYTES_PER_RECORD,
  REQUEST_INSIGHTS_MAX_BYTES_PER_RETENTION_BUCKET,
  REQUEST_INSIGHTS_MAX_BYTES_PER_SPAN,
  REQUEST_INSIGHTS_MAX_EVENTS_PER_SPAN,
  REQUEST_INSIGHTS_MAX_FETCHES_PER_RECORD,
  REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET,
  REQUEST_INSIGHTS_MAX_ID_LENGTH,
  REQUEST_INSIGHTS_MAX_LINKS_PER_SPAN,
  REQUEST_INSIGHTS_MAX_RECORDS_PER_GROUP,
  REQUEST_INSIGHTS_MAX_RETAINED_BYTES,
  REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES,
  REQUEST_INSIGHTS_MAX_SPANS_PER_RECORD,
  updateBoundedRequestInsightsProjection,
} from '../../../shared/lib/request-insights-data'
import type {
  RequestInsightKind,
  RequestInsightsByteLengthCache,
} from '../../../shared/lib/request-insights-data'
import {
  getRequestInsightKey,
  getRequestInsightKind,
  getRequestInsightRetentionBucket,
  getRequestInsightRootId,
  getRequestInsightSource,
  REQUEST_INSIGHT_PROXY_SPAN_TYPE,
  REQUEST_INSIGHT_REQUEST_SPAN_TYPE,
  REQUEST_INSIGHT_RETENTION_BUCKETS,
  type RequestInsightProxyStatus,
  type RequestInsightRetentionBucket,
  type RequestInsightRouterActivity,
  type RequestInsightSource,
} from '../../../shared/lib/request-insights'
import type { SpanStoreRecord } from './span-store'
import { getActiveRequestInsights } from './request-insights-runtime'
import {
  closeRequestInsightsRetentionRecord,
  closeRequestInsightsRetentionRoot,
  hasSameRequestInsightsRetentionContext,
  hasSameRequestInsightsRetentionRoot,
  isRequestInsightsRetentionContextOpen,
  type RequestInsightsRetentionContext,
} from './request-insights-identity'
export { isRequestInsightsEnabled } from './span-store'
export {
  REQUEST_INSIGHTS_ID_PATTERN,
  REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET,
  REQUEST_INSIGHTS_MAX_ID_LENGTH,
} from '../../../shared/lib/request-insights-data'

const MAX_REQUEST_INSIGHT_STRING_LENGTH = 256
const MAX_REQUEST_INSIGHT_SPAN_NAME_LENGTH = 512
const MAX_REQUEST_INSIGHT_ROUTE_LENGTH = 1024
const MAX_REQUEST_INSIGHT_URL_LENGTH = 2048
const MAX_REQUEST_INSIGHT_RAW_URL_LENGTH = 64 * 1024
const MAX_REQUEST_INSIGHT_ATTRIBUTE_ARRAY_LENGTH = 8
const CLIENT_COMPONENT_LOADING_SPAN_TYPE =
  'NextNodeServer.clientComponentLoading'
const SAFE_RESPONSE_ERROR_TYPES = new Set([
  'AbortError',
  'AggregateError',
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'ResponseAborted',
  'SyntaxError',
  'TypeError',
  'URIError',
  'UnknownResponseError',
])

export type RequestInsightsListener = (
  insight: RequestInsight,
  capture: RequestInsightsCaptureState
) => void
export type RequestInsightsLiveListener = (
  update: RequestInsightsLiveUpdate
) => void
export type RequestInsightsSnapshotListener = (
  snapshot: RequestInsightsSnapshot
) => void
export type RequestInsightsSnapshotQuery = {
  requestId?: string
  htmlRequestId?: string
  limit?: number
}

type RequestInsightIdentity = {
  requestId?: string
  rootRequestId?: string
  retention?: RequestInsightsRetentionContext
  kind?: RequestInsightKind
  source?: RequestInsightSource
  proxyStatus?: RequestInsightProxyStatus
  routerActivity?: RequestInsightRouterActivity
  serverAction?: true
  htmlRequestId?: string
  route?: string
  url?: string
}

export type RequestInsightsOptions = {
  maxBytesPerRetentionBucket?: number
  maxRetainedBytes?: number
  maxRequestGroupsPerBucket?: number
  maxSnapshotBytes?: number
}

type RequestInsightsLimits = {
  maxBytesPerRetentionBucket: number
  maxRetainedBytes: number
  maxRequestGroupsPerBucket: number
  maxSnapshotBytes: number
}

// Leave room for the fixed capture and projection metadata envelope.
const MIN_REQUEST_INSIGHTS_SNAPSHOT_BYTES = 2 * 1024

const REDACTED_VALUE = 'redacted'
const SAFE_SPAN_ATTRIBUTE_KEYS = new Set([
  'http.method',
  'http.route',
  'http.status_code',
  'http.url',
  'net.peer.name',
  'net.peer.port',
  'next.fetch.cache_reason',
  'next.fetch.cache_status',
  'next.fetch.idx',
  'next.route',
  'next.request_source',
  'next.rsc',
  'next.segment',
  'next.span_category',
  'next.span_name',
  'next.span_type',
])
const KNOWN_ERROR_TYPES = new Set([
  'AbortError',
  'AggregateError',
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
])

type SanitizationState = {
  truncatedMetadataValueCount: number
}

export class RequestInsights {
  private readonly requests = new Map<string, RequestInsight>()
  private readonly requestTimings = new Map<
    string,
    { startTime: number; durationMs: number }
  >()
  private readonly rootRequestOrder = new Set<string>()
  private readonly rootRequestSequence = new Map<string, number>()
  private readonly requestKeysByRootRequestId = new Map<string, Set<string>>()
  private readonly rootRetentionBuckets = new Map<
    string,
    RequestInsightRetentionBucket
  >()
  private readonly rootRequestOrderByRetentionBucket = new Map<
    RequestInsightRetentionBucket,
    Set<string>
  >()
  private readonly requestByteLengths = new Map<string, number>()
  private readonly rootByteLengths = new Map<string, number>()
  private readonly retainedBytesByBucket = new Map<
    RequestInsightRetentionBucket,
    number
  >()
  private readonly retainedRequestCountsByBucket = new Map<
    RequestInsightRetentionBucket,
    number
  >()
  private readonly retentionContextsByRequestKey = new Map<
    string,
    RequestInsightsRetentionContext
  >()
  private readonly omittedRequestCountsByRootRequestId = new Map<
    string,
    number
  >()
  private readonly evictedRequestGroupCounts = new Map<
    RequestInsightRetentionBucket,
    number
  >()
  private readonly listeners = new Set<RequestInsightsListener>()
  private readonly liveListeners = new Set<RequestInsightsLiveListener>()
  private readonly resyncListeners = new Set<(authoritative: boolean) => void>()
  private readonly snapshotListeners =
    new Set<RequestInsightsSnapshotListener>()
  private readonly limits: RequestInsightsLimits
  private nextRootRequestSequence = 0
  private liveGeneration = 0
  private liveSequence = 0
  private retentionRevision = 0
  private liveSnapshotCache:
    | {
        generation: number
        sequence: number
        retentionRevision: number
        snapshot: RequestInsightsLiveSnapshot
      }
    | undefined
  private expectedLiveProjection:
    | {
        requests: readonly RequestInsight[]
        byteLengths: RequestInsightsByteLengthCache
      }
    | undefined
  private disposed = false

  constructor(options: RequestInsightsOptions = {}) {
    this.limits = normalizeRequestInsightsLimits(options)
  }

  recordSpan(span: SpanStoreRecord): void {
    if (
      this.disposed ||
      !span.requestId ||
      span.attributes?.['next.span_type'] === CLIENT_COMPONENT_LOADING_SPAN_TYPE
    ) {
      return
    }

    const spanStartTime =
      sanitizeFiniteNumber(span.startTime ?? span.timestamp) ??
      getCurrentTimestamp()
    const insight = this.getOrCreateRequest(
      {
        requestId: span.requestId,
        rootRequestId: span.rootRequestId,
        retention: span.requestInsightsRetention,
        kind: span.requestInsightKind,
        source: span.requestInsightSource,
        proxyStatus: span.requestInsightProxyStatus,
        routerActivity: span.requestInsightRouterActivity,
        serverAction: span.requestInsightServerAction,
        htmlRequestId: span.htmlRequestId,
        route: span.route,
        url: span.url,
      },
      spanStartTime
    )
    if (!insight) return

    insight.htmlRequestId =
      sanitizeRequestInsightId(span.htmlRequestId) ?? insight.htmlRequestId
    this.updateClassification(
      insight,
      {
        kind: span.requestInsightKind,
        source: span.requestInsightSource,
        proxyStatus: span.requestInsightProxyStatus,
        routerActivity: span.requestInsightRouterActivity,
        serverAction: span.requestInsightServerAction,
      },
      span
    )
    const route = sanitizeText(span.route, MAX_REQUEST_INSIGHT_ROUTE_LENGTH)
    insight.route = insight.route ?? route
    insight.url = insight.url ?? sanitizeUrl(span.url)
    this.updateTiming(
      insight,
      spanStartTime,
      span.durationMs,
      span.attributes?.['next.span_type'] === REQUEST_INSIGHT_REQUEST_SPAN_TYPE
    )
    if (insight.status === 'aborted') {
      // An actual client disconnect is authoritative over abort-shaped errors
      // emitted later while the response stream is being cleaned up.
    } else if (insight.status === 'error' || span.status === 'error') {
      insight.status = 'error'
    } else if (insight.response?.outcome === 'pending') {
      insight.status = 'pending'
    } else if (span.status === 'ok') {
      insight.status = 'ok'
    }

    this.recordSpanForInsight(insight, sanitizeSpan(span, spanStartTime))
    const fetch = getFetchInsight(span)
    if (fetch) this.recordFetchForInsight(insight, fetch)
    this.finishMutation(insight)
  }

  recordFetch(identity: RequestInsightIdentity, fetch: RequestInsightFetch) {
    if (this.disposed || !identity.requestId) return

    const fetchStartTime =
      sanitizeFiniteNumber(fetch.startTime) ?? getCurrentTimestamp()
    const insight = this.getOrCreateRequest(identity, fetchStartTime)
    if (!insight) return

    this.updateTiming(insight, fetchStartTime, fetch.durationMs, false)
    this.recordFetchForInsight(insight, fetch)
    this.finishMutation(insight)
  }

  recordClassification(identity: RequestInsightIdentity): void {
    if (this.disposed || !identity.requestId) return

    const insight = this.requests.get(
      getRequestInsightKey({
        requestId: identity.requestId,
        kind: identity.kind,
      })
    )
    if (!insight) return

    this.updateClassification(insight, identity)
    this.finishMutation(insight)
  }

  recordRouterActivity(
    identity: RequestInsightIdentity,
    routerActivity: RequestInsightRouterActivity
  ): void {
    identity.routerActivity = routerActivity
    this.recordClassification(identity)
  }

  recordServerAction(identity: RequestInsightIdentity): void {
    identity.serverAction = true
    this.recordClassification(identity)
  }

  recordSource(
    identity: RequestInsightIdentity,
    source: RequestInsightSource
  ): void {
    identity.source = source
    this.recordClassification(identity)
  }

  getSnapshot(
    query: RequestInsightsSnapshotQuery = {}
  ): RequestInsightsSnapshot {
    if (this.disposed) return { requests: [] }

    const requestId = sanitizeRequestInsightId(query.requestId)
    const htmlRequestId = sanitizeRequestInsightId(query.htmlRequestId)
    if (
      (query.requestId !== undefined && requestId === undefined) ||
      (query.htmlRequestId !== undefined && htmlRequestId === undefined)
    ) {
      return { requests: [], capture: this.getCaptureState() }
    }

    const matchingRootIds = new Set<string>()
    for (const insight of this.requests.values()) {
      if (
        (requestId === undefined || insight.requestId === requestId) &&
        (htmlRequestId === undefined || insight.htmlRequestId === htmlRequestId)
      ) {
        matchingRootIds.add(getRequestInsightRootId(insight))
      }
    }

    const groups: RequestInsight[][] = []
    const groupByteLengths: number[] = []
    for (const rootRequestId of this.rootRequestOrder) {
      if (!matchingRootIds.has(rootRequestId)) continue
      const group = Array.from(
        this.requestKeysByRootRequestId.get(rootRequestId) ?? []
      ).flatMap((requestKey) => {
        const request = this.requests.get(requestKey)
        return request ? [request] : []
      })
      if (group.length === 0) continue
      groups.push(group)
      groupByteLengths.push(
        (this.rootByteLengths.get(rootRequestId) ?? 0) +
          2 +
          Math.max(0, group.length - 1)
      )
    }

    const { snapshot } = createBoundedRequestInsightsSnapshotProjection(
      groups,
      this.limits.maxSnapshotBytes,
      this.getCaptureState(),
      sanitizeSnapshotLimit(query.limit),
      groupByteLengths
    )
    return {
      ...snapshot,
      requests: snapshot.requests.map(cloneRequestInsight),
    }
  }

  getCaptureState(): RequestInsightsCaptureState {
    const buckets = REQUEST_INSIGHT_RETENTION_BUCKETS.map((bucket) => ({
      bucket,
      retainedRequestGroupCount:
        this.rootRequestOrderByRetentionBucket.get(bucket)?.size ?? 0,
      retainedRequestCount: this.retainedRequestCountsByBucket.get(bucket) ?? 0,
      retainedBytes: this.retainedBytesByBucket.get(bucket) ?? 0,
      evictedRequestGroupCount: this.evictedRequestGroupCounts.get(bucket) ?? 0,
    }))

    return {
      limits: {
        maxRequestGroupsPerBucket: this.limits.maxRequestGroupsPerBucket,
        maxBytesPerBucket: this.limits.maxBytesPerRetentionBucket,
        maxRetainedBytes: this.limits.maxRetainedBytes,
        maxRecordsPerGroup: REQUEST_INSIGHTS_MAX_RECORDS_PER_GROUP,
        maxSpansPerRecord: REQUEST_INSIGHTS_MAX_SPANS_PER_RECORD,
        maxFetchesPerRecord: REQUEST_INSIGHTS_MAX_FETCHES_PER_RECORD,
        maxBytesPerRecord: REQUEST_INSIGHTS_MAX_BYTES_PER_RECORD,
        maxBytesPerSpan: REQUEST_INSIGHTS_MAX_BYTES_PER_SPAN,
        maxEventsPerSpan: REQUEST_INSIGHTS_MAX_EVENTS_PER_SPAN,
        maxLinksPerSpan: REQUEST_INSIGHTS_MAX_LINKS_PER_SPAN,
        maxSnapshotBytes: this.limits.maxSnapshotBytes,
      },
      usage: {
        retainedRequestGroupCount: this.rootRequestOrder.size,
        retainedRequestCount: this.requests.size,
        retainedBytes: buckets.reduce(
          (total, bucket) => total + bucket.retainedBytes,
          0
        ),
        buckets,
      },
    }
  }

  getLiveSnapshot(): RequestInsightsLiveSnapshot {
    if (
      this.liveSnapshotCache?.generation === this.liveGeneration &&
      this.liveSnapshotCache.sequence === this.liveSequence &&
      this.liveSnapshotCache.retentionRevision === this.retentionRevision
    ) {
      return this.liveSnapshotCache.snapshot
    }

    const snapshot = {
      ...this.getSnapshot(),
      live: {
        generation: this.liveGeneration,
        sequence: this.liveSequence,
        retentionRevision: this.retentionRevision,
      },
    }
    this.liveSnapshotCache = {
      generation: this.liveGeneration,
      sequence: this.liveSequence,
      retentionRevision: this.retentionRevision,
      snapshot,
    }
    this.expectedLiveProjection = {
      requests: snapshot.requests,
      byteLengths: createRequestInsightsByteLengthCache(
        snapshot.requests,
        this.requestByteLengths
      ),
    }
    return snapshot
  }

  subscribe(listener: RequestInsightsListener): () => void {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeLive(listener: RequestInsightsLiveListener): () => void {
    if (this.disposed) return () => {}
    this.liveListeners.add(listener)
    return () => this.liveListeners.delete(listener)
  }

  subscribeSnapshots(listener: RequestInsightsSnapshotListener): () => void {
    if (this.disposed) return () => {}
    this.snapshotListeners.add(listener)
    return () => this.snapshotListeners.delete(listener)
  }

  subscribeResync(listener: (authoritative: boolean) => void): () => void {
    if (this.disposed) return () => {}
    this.resyncListeners.add(listener)
    return () => this.resyncListeners.delete(listener)
  }

  setMaxRequestGroupsPerBucket(value: number | undefined): void {
    if (this.disposed) return

    const nextLimit = normalizeCaptureGroupLimit(value)
    if (nextLimit === this.limits.maxRequestGroupsPerBucket) return

    this.limits.maxRequestGroupsPerBucket = nextLimit
    for (const bucket of REQUEST_INSIGHT_RETENTION_BUCKETS) {
      this.trimRetentionBucket(bucket)
    }
    this.trimGlobalRetention()
    this.advanceRetentionRevision()
    this.notifyResync()
  }

  clear(): void {
    if (this.disposed) return
    this.clearRetainedState()
    this.evictedRequestGroupCounts.clear()
    this.liveGeneration++
    this.advanceRetentionRevision()
    this.notifyResync(true)
  }

  dispose(): void {
    if (this.disposed) return
    this.clearRetainedState()
    this.disposed = true
    this.listeners.clear()
    this.liveListeners.clear()
    this.resyncListeners.clear()
    this.snapshotListeners.clear()
  }

  private clearRetainedState(): void {
    for (const retention of this.retentionContextsByRequestKey.values()) {
      closeRequestInsightsRetentionRoot(retention)
      closeRequestInsightsRetentionRecord(retention)
    }
    this.requests.clear()
    this.requestTimings.clear()
    this.rootRequestOrder.clear()
    this.rootRequestSequence.clear()
    this.requestKeysByRootRequestId.clear()
    this.rootRetentionBuckets.clear()
    this.rootRequestOrderByRetentionBucket.clear()
    this.requestByteLengths.clear()
    this.rootByteLengths.clear()
    this.retainedBytesByBucket.clear()
    this.retainedRequestCountsByBucket.clear()
    this.retentionContextsByRequestKey.clear()
    this.omittedRequestCountsByRootRequestId.clear()
    this.nextRootRequestSequence = 0
  }

  startResponse(identity: RequestInsightIdentity, trackingStartTime: number) {
    if (this.disposed || !identity.requestId) {
      return
    }

    const sanitizedTrackingStartTime = Number.isFinite(trackingStartTime)
      ? trackingStartTime
      : getCurrentTimestamp()
    const insight = this.getOrCreateRequest(
      identity,
      sanitizedTrackingStartTime
    )
    if (!insight) {
      return
    }
    if (insight.response) {
      return
    }

    insight.response = {
      trackingStartTime: sanitizedTrackingStartTime,
      outcome: 'pending',
    }
    if (insight.status !== 'error' && insight.status !== 'aborted') {
      insight.status = 'pending'
    }
    this.updateTiming(insight, sanitizedTrackingStartTime, undefined, false)
    this.enforceInsightByteBudget(insight)
    this.finishMutation(insight)
  }

  completeResponse(
    identity: RequestInsightIdentity,
    response: RequestInsightResponse
  ) {
    if (
      this.disposed ||
      !identity.requestId ||
      response.outcome === 'pending'
    ) {
      return
    }

    const insight = this.requests.get(
      getRequestInsightKey({
        requestId: identity.requestId,
        kind: identity.kind,
      })
    )
    if (insight?.response?.outcome !== 'pending') {
      return
    }

    const trackingStartTime = Number.isFinite(response.trackingStartTime)
      ? response.trackingStartTime
      : insight.response.trackingStartTime
    const endTime = Math.max(
      trackingStartTime,
      Number.isFinite(response.endTime) ? response.endTime! : trackingStartTime
    )
    const statusCode = Number.isFinite(response.statusCode)
      ? response.statusCode
      : undefined

    insight.response = {
      trackingStartTime,
      endTime,
      statusCode,
      outcome: response.outcome,
      error: sanitizeResponseError(response.error),
    }
    this.updateTiming(
      insight,
      trackingStartTime,
      endTime - trackingStartTime,
      false
    )

    if (
      insight.status === 'error' ||
      response.outcome === 'errored' ||
      (statusCode !== undefined && statusCode >= 500)
    ) {
      insight.status = 'error'
    } else if (response.outcome === 'aborted') {
      insight.status = 'aborted'
    } else {
      insight.status = 'ok'
    }
    this.enforceInsightByteBudget(insight)
    this.finishMutation(insight)
  }

  private updateTiming(
    insight: RequestInsight,
    startTime: number,
    durationMs: number | undefined,
    isRequestSpan: boolean
  ): void {
    const requestKey = getRequestInsightKey(insight)
    const nextDurationMs = sanitizeFiniteNumber(durationMs) ?? 0
    if (isRequestSpan && durationMs !== undefined) {
      const timing = { startTime, durationMs: nextDurationMs }
      this.requestTimings.set(requestKey, timing)
    }

    const requestTiming = this.requestTimings.get(requestKey)
    if (requestTiming) {
      const response = insight.response
      const combinedStartTime = response
        ? Math.min(requestTiming.startTime, response.trackingStartTime)
        : requestTiming.startTime
      const endTime = Math.max(
        requestTiming.startTime + requestTiming.durationMs,
        response?.endTime ?? combinedStartTime
      )
      insight.startTime = combinedStartTime
      insight.durationMs = endTime - combinedStartTime
      return
    }

    const current = this.requestTimings.get(requestKey) ?? {
      startTime: insight.startTime,
      durationMs: insight.durationMs ?? 0,
    }
    const nextStartTime = Math.min(current.startTime, startTime)
    const nextEndTime = Math.max(
      current.startTime + current.durationMs,
      startTime + nextDurationMs
    )
    const timing = {
      startTime: nextStartTime,
      durationMs: nextEndTime - nextStartTime,
    }
    insight.startTime = timing.startTime
    insight.durationMs = timing.durationMs
  }

  private notify(insight: RequestInsight, requiresResync = false): void {
    const sequence = ++this.liveSequence
    this.liveSnapshotCache = undefined
    const capture = this.getCaptureState()
    let requiresProjectionResync = false
    if (this.expectedLiveProjection !== undefined) {
      const predicted = updateBoundedRequestInsightsProjection(
        this.expectedLiveProjection.requests,
        this.expectedLiveProjection.byteLengths,
        cloneRequestInsight(insight),
        capture,
        this.requestByteLengths.get(getRequestInsightKey(insight))
      )
      const authoritativeRequests = this.getCurrentLiveProjection(capture)
      requiresProjectionResync = !hasSameRequestInsightOrder(
        predicted.requests,
        authoritativeRequests
      )
      if (requiresResync || requiresProjectionResync) {
        const requests = authoritativeRequests.map(cloneRequestInsight)
        this.expectedLiveProjection = {
          requests,
          byteLengths: createRequestInsightsByteLengthCache(
            requests,
            this.requestByteLengths
          ),
        }
      } else {
        this.expectedLiveProjection = predicted
      }
    }
    for (const listener of this.listeners) {
      try {
        listener(cloneRequestInsight(insight), cloneCaptureState(capture))
      } catch (error) {
        console.error('[request-insights] listener failed', error)
      }
    }
    for (const listener of this.liveListeners) {
      try {
        listener({
          insight: cloneRequestInsight(insight),
          capture: cloneCaptureState(capture),
          generation: this.liveGeneration,
          sequence,
          retentionRevision: this.retentionRevision,
          requiresResync:
            requiresResync || requiresProjectionResync || undefined,
        })
      } catch (error) {
        console.error('[request-insights] live listener failed', error)
      }
    }
  }

  private getCurrentLiveProjection(
    capture: RequestInsightsCaptureState
  ): readonly RequestInsight[] {
    const groups: RequestInsight[][] = []
    const groupByteLengths: number[] = []
    for (const rootRequestId of this.rootRequestOrder) {
      const group = Array.from(
        this.requestKeysByRootRequestId.get(rootRequestId) ?? []
      ).flatMap((requestKey) => {
        const request = this.requests.get(requestKey)
        return request ? [request] : []
      })
      if (group.length === 0) continue
      groups.push(group)
      groupByteLengths.push(
        (this.rootByteLengths.get(rootRequestId) ?? 0) +
          2 +
          Math.max(0, group.length - 1)
      )
    }
    return createBoundedRequestInsightsSnapshotProjection(
      groups,
      this.limits.maxSnapshotBytes,
      capture,
      Number.POSITIVE_INFINITY,
      groupByteLengths
    ).snapshot.requests
  }

  private advanceRetentionRevision(): void {
    this.retentionRevision++
    this.liveSequence++
    this.liveSnapshotCache = undefined
  }

  private notifyResync(authoritative = false): void {
    if (this.snapshotListeners.size > 0) {
      const snapshot = this.getSnapshot()
      for (const listener of this.snapshotListeners) {
        try {
          listener(snapshot)
        } catch (error) {
          console.error('[request-insights] snapshot listener failed', error)
        }
      }
    }
    for (const listener of this.resyncListeners) {
      try {
        listener(authoritative)
      } catch (error) {
        console.error('[request-insights] resync listener failed', error)
      }
    }
  }

  private getOrCreateRequest(
    identity: RequestInsightIdentity,
    startTime: number
  ): RequestInsight | undefined {
    const requestId = sanitizeRequestInsightId(identity.requestId)
    if (!requestId) return undefined

    const rootRequestId =
      sanitizeRequestInsightId(identity.rootRequestId) ?? requestId
    const requestKey = getRequestInsightKey({
      requestId,
      kind: identity.kind,
    })
    const retention = identity.retention
    if (retention && !isRequestInsightsRetentionContextOpen(retention)) {
      return undefined
    }

    const retainedContext = this.retentionContextsByRequestKey.get(requestKey)
    const retainedRootContext =
      retainedContext ?? this.getRetentionContextForRoot(rootRequestId)
    if (
      retainedContext
        ? !retention ||
          !hasSameRequestInsightsRetentionContext(retainedContext, retention)
        : retainedRootContext &&
          (!retention ||
            !hasSameRequestInsightsRetentionRoot(
              retainedRootContext,
              retention
            ))
    ) {
      return undefined
    }

    let insight = this.requests.get(requestKey)
    if (!insight) {
      insight = {
        requestId,
        rootRequestId,
        kind: getRequestInsightKind(identity),
        source: getRequestInsightSource(identity),
        proxyStatus: identity.proxyStatus,
        routerActivity: identity.routerActivity,
        serverAction: identity.serverAction,
        htmlRequestId:
          sanitizeRequestInsightId(identity.htmlRequestId) ?? requestId,
        route: sanitizeText(identity.route, MAX_REQUEST_INSIGHT_ROUTE_LENGTH),
        url: sanitizeUrl(identity.url),
        startTime: sanitizeFiniteNumber(startTime) ?? getCurrentTimestamp(),
        status: 'pending',
        spans: [],
        fetches: [],
      }
      this.requests.set(requestKey, insight)
      let requestKeys = this.requestKeysByRootRequestId.get(rootRequestId)
      if (!requestKeys) {
        requestKeys = new Set()
        this.requestKeysByRootRequestId.set(rootRequestId, requestKeys)
        this.rootRequestOrder.add(rootRequestId)
        this.rootRequestSequence.set(
          rootRequestId,
          this.nextRootRequestSequence++
        )
        const bucket = getRequestInsightRetentionBucket(insight)
        this.rootRetentionBuckets.set(rootRequestId, bucket)
        this.getRootRequestOrderForBucket(bucket).add(rootRequestId)
      }
      requestKeys.add(requestKey)
      const bucket = this.rootRetentionBuckets.get(rootRequestId) ?? 'unknown'
      this.retainedRequestCountsByBucket.set(
        bucket,
        (this.retainedRequestCountsByBucket.get(bucket) ?? 0) + 1
      )
      if (retention)
        this.retentionContextsByRequestKey.set(requestKey, retention)
    } else if (!retainedContext && retention) {
      this.retentionContextsByRequestKey.set(requestKey, retention)
    }

    insight.htmlRequestId =
      sanitizeRequestInsightId(identity.htmlRequestId) ?? insight.htmlRequestId
    insight.route =
      insight.route ??
      sanitizeText(identity.route, MAX_REQUEST_INSIGHT_ROUTE_LENGTH)
    insight.url = insight.url ?? sanitizeUrl(identity.url)
    this.updateClassification(insight, identity)
    return insight
  }

  private getRetentionContextForRoot(
    rootRequestId: string
  ): RequestInsightsRetentionContext | undefined {
    for (const requestKey of this.requestKeysByRootRequestId.get(
      rootRequestId
    ) ?? []) {
      const retention = this.retentionContextsByRequestKey.get(requestKey)
      if (retention) return retention
    }
    return undefined
  }

  private updateClassification(
    insight: RequestInsight,
    identity: RequestInsightIdentity,
    span?: SpanStoreRecord
  ): void {
    const source = identity.source ?? getSourceFromSpan(span)
    insight.source = refineSource(insight.source, source)
    insight.proxyStatus = identity.proxyStatus ?? insight.proxyStatus
    insight.routerActivity = identity.routerActivity ?? insight.routerActivity
    insight.serverAction = identity.serverAction ?? insight.serverAction
  }

  private recordFetchForInsight(
    insight: RequestInsight,
    fetch: RequestInsightFetch
  ): void {
    const sanitizedFetch = sanitizeFetchInsight(fetch)
    if (
      insight.fetches.some(
        (existingFetch) =>
          existingFetch.url === sanitizedFetch.url &&
          (existingFetch.index !== undefined &&
          sanitizedFetch.index !== undefined
            ? existingFetch.index === sanitizedFetch.index
            : existingFetch.startTime === sanitizedFetch.startTime)
      )
    ) {
      return
    }

    if (insight.fetches.length >= REQUEST_INSIGHTS_MAX_FETCHES_PER_RECORD) {
      insight.fetches.shift()
      insight.truncatedFetchCount = (insight.truncatedFetchCount ?? 0) + 1
    }
    insight.fetches.push(sanitizedFetch)
    this.enforceInsightByteBudget(insight)
  }

  private recordSpanForInsight(
    insight: RequestInsight,
    span: RequestInsightSpan
  ): void {
    if (insight.spans.length < REQUEST_INSIGHTS_MAX_SPANS_PER_RECORD) {
      insight.spans.push(span)
      this.enforceInsightByteBudget(insight)
      return
    }

    const removableSpanIndex = insight.spans.findIndex(
      (retainedSpan) => !isRootRequestInsightSpan(retainedSpan)
    )
    if (removableSpanIndex !== -1) {
      insight.spans.splice(removableSpanIndex, 1)
      insight.spans.push(span)
    } else if (isRootRequestInsightSpan(span)) {
      insight.spans.shift()
      insight.spans.push(span)
    }
    insight.truncatedSpanCount = (insight.truncatedSpanCount ?? 0) + 1
    this.enforceInsightByteBudget(insight)
  }

  private enforceInsightByteBudget(insight: RequestInsight): void {
    while (
      getSerializedByteLength(insight) >
        REQUEST_INSIGHTS_MAX_BYTES_PER_RECORD &&
      (insight.spans.length > 1 || insight.fetches.length > 0)
    ) {
      const nonRootSpanIndex = insight.spans.findIndex(
        (span) => !isRootRequestInsightSpan(span)
      )
      const removableSpanIndex =
        nonRootSpanIndex === -1 && insight.spans.length > 1
          ? 0
          : nonRootSpanIndex
      const oldestSpan =
        removableSpanIndex === -1
          ? undefined
          : insight.spans[removableSpanIndex]
      const oldestFetch = insight.fetches[0]

      if (
        oldestSpan &&
        (!oldestFetch ||
          oldestSpan.startTime <=
            (oldestFetch.startTime ?? Number.POSITIVE_INFINITY))
      ) {
        insight.spans.splice(removableSpanIndex, 1)
        insight.truncatedSpanCount = (insight.truncatedSpanCount ?? 0) + 1
      } else if (oldestFetch) {
        insight.fetches.shift()
        insight.truncatedFetchCount = (insight.truncatedFetchCount ?? 0) + 1
      } else {
        break
      }
    }
  }

  private finishMutation(insight: RequestInsight): void {
    const { metadataUpdates, removedMembership } = this.trimGroup(
      getRequestInsightRootId(insight)
    )
    if (this.requests.has(getRequestInsightKey(insight))) {
      this.updateStoredInsightByteLength(insight)
    }
    for (const updated of metadataUpdates) {
      if (this.requests.has(getRequestInsightKey(updated))) {
        this.updateStoredInsightByteLength(updated)
      }
    }

    const bucket = this.refreshRootRetentionBucket(
      getRequestInsightRootId(insight)
    )
    const membershipChanged =
      removedMembership ||
      this.trimRetentionBucket(bucket) ||
      this.trimGlobalRetention()

    if (membershipChanged) this.advanceRetentionRevision()
    if (this.requests.has(getRequestInsightKey(insight))) {
      this.notify(insight, membershipChanged)
    }
    for (const updated of metadataUpdates) {
      if (
        updated !== insight &&
        this.requests.has(getRequestInsightKey(updated))
      ) {
        this.notify(updated, membershipChanged)
      }
    }
    if (membershipChanged) this.notifyResync()
  }

  private trimGroup(rootRequestId: string): {
    metadataUpdates: RequestInsight[]
    removedMembership: boolean
  } {
    const requestKeys = this.requestKeysByRootRequestId.get(rootRequestId)
    if (!requestKeys) {
      return { metadataUpdates: [], removedMembership: false }
    }

    const orderedKeys = Array.from(requestKeys)
    const canonicalRootKey = orderedKeys.find((requestKey) => {
      const request = this.requests.get(requestKey)
      return (
        request?.requestId === rootRequestId &&
        getRequestInsightKind(request) === 'request'
      )
    })
    let omittedRequestCount = 0
    while (orderedKeys.length > REQUEST_INSIGHTS_MAX_RECORDS_PER_GROUP) {
      const removableIndex = orderedKeys.findIndex(
        (requestKey) => requestKey !== canonicalRootKey
      )
      if (removableIndex === -1) break
      const [requestKey] = orderedKeys.splice(removableIndex, 1)
      this.removeRequest(requestKey, false)
      omittedRequestCount++
    }

    if (omittedRequestCount > 0) {
      this.omittedRequestCountsByRootRequestId.set(
        rootRequestId,
        (this.omittedRequestCountsByRootRequestId.get(rootRequestId) ?? 0) +
          omittedRequestCount
      )
    }

    const retained = orderedKeys.flatMap((requestKey) => {
      const request = this.requests.get(requestKey)
      return request ? [request] : []
    })
    const metadataHolder =
      (canonicalRootKey ? this.requests.get(canonicalRootKey) : undefined) ??
      retained[0]
    const totalOmitted =
      this.omittedRequestCountsByRootRequestId.get(rootRequestId)
    const updates: RequestInsight[] = []
    for (const request of retained) {
      const nextOmitted = request === metadataHolder ? totalOmitted : undefined
      if (request.omittedRequestCount !== nextOmitted) {
        request.omittedRequestCount = nextOmitted
        this.enforceInsightByteBudget(request)
        updates.push(request)
      }
    }
    return {
      metadataUpdates: updates,
      removedMembership: omittedRequestCount > 0,
    }
  }

  private updateStoredInsightByteLength(insight: RequestInsight): void {
    const requestKey = getRequestInsightKey(insight)
    if (!this.requests.has(requestKey)) return

    const rootRequestId = getRequestInsightRootId(insight)
    const previousByteLength = this.requestByteLengths.get(requestKey) ?? 0
    const nextByteLength = getSerializedByteLength(insight)
    const delta = nextByteLength - previousByteLength
    if (delta === 0) return

    this.requestByteLengths.set(requestKey, nextByteLength)
    this.rootByteLengths.set(
      rootRequestId,
      (this.rootByteLengths.get(rootRequestId) ?? 0) + delta
    )
    const bucket =
      this.rootRetentionBuckets.get(rootRequestId) ??
      getRequestInsightRetentionBucket(insight)
    this.retainedBytesByBucket.set(
      bucket,
      (this.retainedBytesByBucket.get(bucket) ?? 0) + delta
    )
  }

  private refreshRootRetentionBucket(
    rootRequestId: string
  ): RequestInsightRetentionBucket {
    const requests = Array.from(
      this.requestKeysByRootRequestId.get(rootRequestId) ?? []
    ).flatMap((requestKey) => {
      const request = this.requests.get(requestKey)
      return request ? [request] : []
    })
    const representative =
      requests.find(
        (request) =>
          request.requestId === rootRequestId &&
          getRequestInsightKind(request) === 'request'
      ) ??
      requests.find(
        (request) => getRequestInsightKind(request) === 'request'
      ) ??
      requests[0]
    const nextBucket = getRequestInsightRetentionBucket(representative ?? {})
    const previousBucket = this.rootRetentionBuckets.get(rootRequestId)
    if (previousBucket === nextBucket) return nextBucket

    const rootByteLength = this.rootByteLengths.get(rootRequestId) ?? 0
    const rootRequestCount =
      this.requestKeysByRootRequestId.get(rootRequestId)?.size ?? 0
    if (previousBucket) {
      this.rootRequestOrderByRetentionBucket
        .get(previousBucket)
        ?.delete(rootRequestId)
      this.retainedBytesByBucket.set(
        previousBucket,
        Math.max(
          0,
          (this.retainedBytesByBucket.get(previousBucket) ?? 0) - rootByteLength
        )
      )
      this.retainedRequestCountsByBucket.set(
        previousBucket,
        Math.max(
          0,
          (this.retainedRequestCountsByBucket.get(previousBucket) ?? 0) -
            rootRequestCount
        )
      )
    }
    this.retainedBytesByBucket.set(
      nextBucket,
      (this.retainedBytesByBucket.get(nextBucket) ?? 0) + rootByteLength
    )
    this.retainedRequestCountsByBucket.set(
      nextBucket,
      (this.retainedRequestCountsByBucket.get(nextBucket) ?? 0) +
        rootRequestCount
    )
    this.rootRetentionBuckets.set(rootRequestId, nextBucket)
    this.addRootRequestToBucketOrder(nextBucket, rootRequestId)
    return nextBucket
  }

  private addRootRequestToBucketOrder(
    bucket: RequestInsightRetentionBucket,
    rootRequestId: string
  ): void {
    const order = this.getRootRequestOrderForBucket(bucket)
    const sequence = this.rootRequestSequence.get(rootRequestId)
    if (sequence === undefined || order.size === 0) {
      order.add(rootRequestId)
      return
    }

    const nextOrder = new Set<string>()
    let inserted = false
    for (const existingRootRequestId of order) {
      if (
        !inserted &&
        (this.rootRequestSequence.get(existingRootRequestId) ?? -1) > sequence
      ) {
        nextOrder.add(rootRequestId)
        inserted = true
      }
      nextOrder.add(existingRootRequestId)
    }
    if (!inserted) nextOrder.add(rootRequestId)
    this.rootRequestOrderByRetentionBucket.set(bucket, nextOrder)
  }

  private getRootRequestOrderForBucket(
    bucket: RequestInsightRetentionBucket
  ): Set<string> {
    let order = this.rootRequestOrderByRetentionBucket.get(bucket)
    if (!order) {
      order = new Set()
      this.rootRequestOrderByRetentionBucket.set(bucket, order)
    }
    return order
  }

  private trimRetentionBucket(bucket: RequestInsightRetentionBucket): boolean {
    const roots = this.getRootRequestOrderForBucket(bucket)
    let removedMembership = false
    while (roots.size > this.limits.maxRequestGroupsPerBucket) {
      const rootRequestId = roots.values().next().value
      if (!rootRequestId) break
      if (!this.evictRoot(rootRequestId)) break
      removedMembership = true
    }

    while (
      (this.retainedBytesByBucket.get(bucket) ?? 0) >
      this.limits.maxBytesPerRetentionBucket
    ) {
      const rootRequestId = roots.values().next().value
      if (!rootRequestId) break
      if (!this.evictRoot(rootRequestId)) break
      removedMembership = true
    }
    return removedMembership
  }

  private trimGlobalRetention(): boolean {
    let removedMembership = false
    while (this.getRetainedByteLength() > this.limits.maxRetainedBytes) {
      const rootRequestId = this.rootRequestOrder.values().next().value
      if (!rootRequestId || !this.evictRoot(rootRequestId)) break
      removedMembership = true
    }
    return removedMembership
  }

  private getRetainedByteLength(): number {
    let total = 0
    for (const bucket of REQUEST_INSIGHT_RETENTION_BUCKETS) {
      total += this.retainedBytesByBucket.get(bucket) ?? 0
    }
    return total
  }

  private evictRoot(rootRequestId: string): boolean {
    const requestKeys = Array.from(
      this.requestKeysByRootRequestId.get(rootRequestId) ?? []
    )
    if (requestKeys.length === 0) return false
    const bucket = this.rootRetentionBuckets.get(rootRequestId) ?? 'unknown'
    for (const requestKey of requestKeys) this.removeRequest(requestKey, true)
    this.evictedRequestGroupCounts.set(
      bucket,
      (this.evictedRequestGroupCounts.get(bucket) ?? 0) + 1
    )
    return true
  }

  private removeRequest(requestKey: string, closeRoot: boolean): void {
    const insight = this.requests.get(requestKey)
    if (!insight) return

    const rootRequestId = getRequestInsightRootId(insight)
    const retention = this.retentionContextsByRequestKey.get(requestKey)
    if (retention) {
      if (closeRoot) closeRequestInsightsRetentionRoot(retention)
      closeRequestInsightsRetentionRecord(retention)
      this.retentionContextsByRequestKey.delete(requestKey)
    }

    const byteLength = this.requestByteLengths.get(requestKey) ?? 0
    const bucket = this.rootRetentionBuckets.get(rootRequestId)
    this.requestByteLengths.delete(requestKey)
    this.rootByteLengths.set(
      rootRequestId,
      Math.max(0, (this.rootByteLengths.get(rootRequestId) ?? 0) - byteLength)
    )
    if (bucket) {
      this.retainedBytesByBucket.set(
        bucket,
        Math.max(0, (this.retainedBytesByBucket.get(bucket) ?? 0) - byteLength)
      )
      this.retainedRequestCountsByBucket.set(
        bucket,
        Math.max(0, (this.retainedRequestCountsByBucket.get(bucket) ?? 0) - 1)
      )
    }

    this.requests.delete(requestKey)
    this.requestTimings.delete(requestKey)
    const requestKeys = this.requestKeysByRootRequestId.get(rootRequestId)
    requestKeys?.delete(requestKey)
    if (requestKeys?.size === 0) {
      this.requestKeysByRootRequestId.delete(rootRequestId)
      this.rootRequestOrder.delete(rootRequestId)
      this.rootRequestSequence.delete(rootRequestId)
      if (bucket) {
        this.rootRequestOrderByRetentionBucket
          .get(bucket)
          ?.delete(rootRequestId)
      }
      this.rootRetentionBuckets.delete(rootRequestId)
      this.rootByteLengths.delete(rootRequestId)
      this.omittedRequestCountsByRootRequestId.delete(rootRequestId)
    }
  }
}

function isRootRequestInsightSpan(span: RequestInsightSpan): boolean {
  return (
    span.attributes?.['next.span_type'] === REQUEST_INSIGHT_REQUEST_SPAN_TYPE
  )
}

function refineSource(
  current: RequestInsightSource,
  candidate: RequestInsightSource | undefined
): RequestInsightSource {
  if (!candidate || candidate === 'unknown') return current
  if (
    candidate === 'app-route' ||
    candidate === 'pages-api' ||
    candidate === 'image' ||
    candidate === 'asset' ||
    candidate === 'instant-insights'
  ) {
    return candidate
  }
  if (current === 'unknown' || current === 'proxy') return candidate
  return current
}

function getSourceFromSpan(
  span: SpanStoreRecord | undefined
): RequestInsightSource | undefined {
  if (!span) return undefined
  const spanType = getStringAttribute(span.attributes?.['next.span_type'])
  const markedSource = getStringAttribute(
    span.attributes?.['next.request_source']
  )
  if (markedSource === 'image' || markedSource === 'asset') return markedSource
  if (spanType === 'AppRouteRouteHandlers.runHandler') return 'app-route'
  if (spanType === 'Node.runHandler') return 'pages-api'
  if (spanType === 'NextNodeServer.imageOptimizer') return 'image'
  if (spanType === REQUEST_INSIGHT_REQUEST_SPAN_TYPE) return 'page'
  if (spanType === REQUEST_INSIGHT_PROXY_SPAN_TYPE) return 'proxy'
  return undefined
}

export function recordRequestInsightSpan(span: SpanStoreRecord): void {
  if (
    span.attributes?.['next.span_type'] !== CLIENT_COMPONENT_LOADING_SPAN_TYPE
  ) {
    getActiveRequestInsights()?.recordSpan(span)
  }
}

export function recordRequestInsightFetch(
  identity: RequestInsightIdentity,
  fetch: RequestInsightFetch
): void {
  getActiveRequestInsights()?.recordFetch(identity, fetch)
}

export function recordRequestInsightRouterActivity(
  identity: RequestInsightIdentity,
  routerActivity: RequestInsightRouterActivity
): void {
  getActiveRequestInsights()?.recordRouterActivity(identity, routerActivity)
}

export function recordRequestInsightServerAction(
  identity: RequestInsightIdentity
): void {
  getActiveRequestInsights()?.recordServerAction(identity)
}

export function recordRequestInsightSource(
  identity: RequestInsightIdentity,
  source: RequestInsightSource
): void {
  getActiveRequestInsights()?.recordSource(identity, source)
}

export function getRequestInsightsSnapshot(): RequestInsightsSnapshot {
  return getActiveRequestInsights()?.getSnapshot() ?? { requests: [] }
}

export function subscribeRequestInsights(
  listener: RequestInsightsListener
): () => void {
  return getActiveRequestInsights()?.subscribe(listener) ?? (() => {})
}

export function clearRequestInsightsForTest(): void {
  getActiveRequestInsights()?.clear()
}

function getFetchInsight(span: SpanStoreRecord): RequestInsightFetch | null {
  const attributes = span.attributes
  if (!attributes || attributes['next.span_type'] !== 'AppRender.fetch') {
    return null
  }
  return {
    url: getStringAttribute(attributes['http.url']) ?? span.url,
    method: getStringAttribute(attributes['http.method']),
    statusCode: getNumberAttribute(attributes['http.status_code']),
    startTime: span.startTime ?? span.timestamp,
    durationMs: span.durationMs,
    cacheStatus: getStringAttribute(attributes['next.fetch.cache_status']),
    cacheReason: getStringAttribute(attributes['next.fetch.cache_reason']),
    index: getNumberAttribute(attributes['next.fetch.idx']),
  }
}

function sanitizeFetchInsight(fetch: RequestInsightFetch): RequestInsightFetch {
  return {
    url: sanitizeUrl(fetch.url),
    method: sanitizeText(fetch.method, 32),
    statusCode: sanitizeFiniteNumber(fetch.statusCode),
    startTime: sanitizeFiniteNumber(fetch.startTime),
    durationMs: sanitizeFiniteNumber(fetch.durationMs),
    cacheStatus: sanitizeText(
      fetch.cacheStatus,
      MAX_REQUEST_INSIGHT_STRING_LENGTH
    ),
    cacheReason: sanitizeText(
      fetch.cacheReason,
      MAX_REQUEST_INSIGHT_STRING_LENGTH
    ),
    index: sanitizeFiniteNumber(fetch.index),
  }
}

function sanitizeSpan(
  span: SpanStoreRecord,
  startTime: number
): RequestInsightSpan {
  const state: SanitizationState = { truncatedMetadataValueCount: 0 }
  const name = sanitizeSpanName(span, state)
  const retainedEvents = span.events?.slice(
    0,
    REQUEST_INSIGHTS_MAX_EVENTS_PER_SPAN
  )
  const retainedLinks = span.links?.slice(
    0,
    REQUEST_INSIGHTS_MAX_LINKS_PER_SPAN
  )
  const events = retainedEvents?.map((event) => {
    const eventName =
      sanitizeText(event.name, MAX_REQUEST_INSIGHT_SPAN_NAME_LENGTH, state) ??
      ''
    return {
      name: eventName,
      timestamp: sanitizeFiniteNumber(event.timestamp) ?? 0,
      attributes: sanitizeSpanAttributes(event.attributes, eventName, state),
    }
  })
  const links = retainedLinks?.flatMap((link) => {
    const traceId = sanitizeText(
      link.traceId,
      REQUEST_INSIGHTS_MAX_ID_LENGTH,
      state
    )
    const spanId = sanitizeText(
      link.spanId,
      REQUEST_INSIGHTS_MAX_ID_LENGTH,
      state
    )
    return traceId && spanId
      ? [
          {
            traceId,
            spanId,
            attributes: sanitizeSpanAttributes(
              link.attributes,
              undefined,
              state
            ),
          },
        ]
      : []
  })
  const sanitized: RequestInsightSpan = {
    name,
    startTime,
    durationMs: sanitizeFiniteNumber(span.durationMs),
    status: span.status,
    traceId: sanitizeText(span.traceId, REQUEST_INSIGHTS_MAX_ID_LENGTH, state),
    spanId: sanitizeText(span.spanId, REQUEST_INSIGHTS_MAX_ID_LENGTH, state),
    parentSpanId: sanitizeText(
      span.parentSpanId,
      REQUEST_INSIGHTS_MAX_ID_LENGTH,
      state
    ),
    attributes: sanitizeSpanAttributes(span.attributes, name, state),
    events,
    links,
    error: sanitizeSpanError(span.error, state),
    truncatedMetadataValueCount: state.truncatedMetadataValueCount || undefined,
    truncatedEventCount:
      span.events && retainedEvents
        ? span.events.length - retainedEvents.length || undefined
        : undefined,
    truncatedLinkCount:
      span.links && retainedLinks
        ? span.links.length - links!.length || undefined
        : undefined,
  }
  return enforceSpanByteBudget(sanitized)
}

function sanitizeSpanName(
  span: SpanStoreRecord,
  state: SanitizationState
): string {
  if (span.attributes?.['next.span_type'] !== 'AppRender.fetch') {
    return (
      sanitizeText(span.name, MAX_REQUEST_INSIGHT_SPAN_NAME_LENGTH, state) ?? ''
    )
  }
  const method = getStringAttribute(span.attributes['http.method'])
  const url = sanitizeUrl(
    getStringAttribute(span.attributes['http.url']) ?? span.url,
    state
  )
  return (
    sanitizeText(
      ['fetch', method, url].filter(Boolean).join(' '),
      MAX_REQUEST_INSIGHT_SPAN_NAME_LENGTH,
      state
    ) ?? ''
  )
}

function sanitizeResponseError(
  error: RequestInsightResponse['error']
): RequestInsightResponse['error'] {
  if (!error?.type) {
    return undefined
  }

  return {
    type: SAFE_RESPONSE_ERROR_TYPES.has(error.type) ? error.type : 'Error',
  }
}

function sanitizeSpanAttributes(
  attributes: SpanStoreRecord['attributes'],
  sanitizedSpanName: string | undefined,
  state: SanitizationState
): SpanStoreRecord['attributes'] {
  if (!attributes) return undefined
  const sanitized: NonNullable<SpanStoreRecord['attributes']> = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (!SAFE_SPAN_ATTRIBUTE_KEYS.has(key)) continue
    const sanitizedValue =
      key === 'http.url'
        ? sanitizeUrlAttribute(value, state)
        : key === 'next.span_name' && sanitizedSpanName
          ? sanitizedSpanName
          : sanitizeAttributeValue(value, state)
    if (sanitizedValue !== undefined) sanitized[key] = sanitizedValue
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

function sanitizeUrlAttribute(
  value: AttributeValue,
  state: SanitizationState
): AttributeValue | undefined {
  if (typeof value === 'string') {
    return sanitizeUrl(value, state) ?? REDACTED_VALUE
  }
  if (!Array.isArray(value)) return sanitizeAttributeValue(value, state)
  const retained = value.slice(0, MAX_REQUEST_INSIGHT_ATTRIBUTE_ARRAY_LENGTH)
  if (retained.length < value.length) state.truncatedMetadataValueCount++
  return retained.map((item) =>
    typeof item === 'string'
      ? (sanitizeUrl(item, state) ?? REDACTED_VALUE)
      : item
  ) as AttributeValue
}

function sanitizeAttributeValue(
  value: AttributeValue,
  state: SanitizationState
): AttributeValue | undefined {
  if (typeof value === 'string') {
    return sanitizeText(value, MAX_REQUEST_INSIGHT_STRING_LENGTH, state)
  }
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean') return value
  if (!Array.isArray(value)) return undefined
  const retained = value.slice(0, MAX_REQUEST_INSIGHT_ATTRIBUTE_ARRAY_LENGTH)
  if (retained.length < value.length) state.truncatedMetadataValueCount++
  return retained.map((item) =>
    typeof item === 'string'
      ? sanitizeText(item, 64, state)
      : typeof item === 'number' && !Number.isFinite(item)
        ? undefined
        : item
  ) as AttributeValue
}

function sanitizeSpanError(
  error: SpanStoreRecord['error'],
  state: SanitizationState
): RequestInsightSpan['error'] {
  if (!error) return undefined
  return {
    type:
      typeof error.type === 'string' && KNOWN_ERROR_TYPES.has(error.type)
        ? error.type
        : 'Error',
    message: sanitizeText(
      error.message,
      MAX_REQUEST_INSIGHT_STRING_LENGTH,
      state
    ),
  }
}

function enforceSpanByteBudget(span: RequestInsightSpan): RequestInsightSpan {
  if (getSerializedByteLength(span) <= REQUEST_INSIGHTS_MAX_BYTES_PER_SPAN) {
    return span
  }

  let truncatedMetadataValueCount = span.truncatedMetadataValueCount ?? 0
  span.events = span.events?.map((event) => {
    truncatedMetadataValueCount += Object.keys(event.attributes ?? {}).length
    return { name: event.name, timestamp: event.timestamp }
  })
  span.links = span.links?.map((link) => {
    truncatedMetadataValueCount += Object.keys(link.attributes ?? {}).length
    return { traceId: link.traceId, spanId: link.spanId }
  })

  while (
    getSerializedByteLength(span) > REQUEST_INSIGHTS_MAX_BYTES_PER_SPAN &&
    span.events?.length
  ) {
    span.events.shift()
    span.truncatedEventCount = (span.truncatedEventCount ?? 0) + 1
  }
  while (
    getSerializedByteLength(span) > REQUEST_INSIGHTS_MAX_BYTES_PER_SPAN &&
    span.links?.length
  ) {
    span.links.shift()
    span.truncatedLinkCount = (span.truncatedLinkCount ?? 0) + 1
  }
  if (getSerializedByteLength(span) > REQUEST_INSIGHTS_MAX_BYTES_PER_SPAN) {
    const spanType = span.attributes?.['next.span_type']
    truncatedMetadataValueCount += Math.max(
      0,
      Object.keys(span.attributes ?? {}).length -
        (spanType === undefined ? 0 : 1)
    )
    span.attributes =
      spanType === undefined ? undefined : { 'next.span_type': spanType }
  }
  span.truncatedMetadataValueCount = truncatedMetadataValueCount || undefined
  return span
}

function sanitizeUrl(
  value: string | undefined,
  state?: SanitizationState
): string | undefined {
  if (!value) return value
  if (value.length > MAX_REQUEST_INSIGHT_RAW_URL_LENGTH) {
    if (state) state.truncatedMetadataValueCount++
    return undefined
  }
  const isProtocolRelativeUrl = value.startsWith('//')
  const isRootRelativeUrl = !isProtocolRelativeUrl && value.startsWith('/')
  const hasProtocol = /^[a-z][a-z\d+.-]*:/i.test(value)
  if (!isProtocolRelativeUrl && !isRootRelativeUrl && !hasProtocol) {
    return undefined
  }

  try {
    const url =
      isProtocolRelativeUrl || isRootRelativeUrl
        ? new URL(value, 'http://n')
        : new URL(value)
    if (url.protocol === 'data:' || url.protocol === 'blob:') {
      return `${url.protocol}${REDACTED_VALUE}`
    }
    if (url.origin === 'null' && !url.hostname) {
      return `${url.protocol}${REDACTED_VALUE}`
    }
    url.username = ''
    url.password = ''
    url.hash = ''
    const hasApplicationQuery = Array.from(url.searchParams.keys()).some(
      (name) => name !== '_rsc'
    )
    url.search = hasApplicationQuery ? `?query=${REDACTED_VALUE}` : ''
    const sanitizedUrl = isProtocolRelativeUrl
      ? `//${url.host}${url.pathname}${url.search}`
      : isRootRelativeUrl
        ? `${url.pathname}${url.search}`
        : url.href
    return sanitizeText(sanitizedUrl, MAX_REQUEST_INSIGHT_URL_LENGTH, state)
  } catch {
    return undefined
  }
}

function sanitizeText(
  value: string | undefined,
  maxLength: number,
  state?: SanitizationState
): string | undefined {
  if (value === undefined || value.length <= maxLength) return value
  if (state) state.truncatedMetadataValueCount++
  let end = Math.max(0, maxLength - 1)
  if (end > 0) {
    const charCode = value.charCodeAt(end - 1)
    if (charCode >= 0xd800 && charCode <= 0xdbff) end--
  }
  return `${value.slice(0, end)}…`
}

function sanitizeRequestInsightId(value: string | undefined) {
  if (
    !value ||
    value.length > REQUEST_INSIGHTS_MAX_ID_LENGTH ||
    !REQUEST_INSIGHTS_ID_PATTERN.test(value)
  ) {
    return undefined
  }
  return value
}

function sanitizeSnapshotLimit(value: number | undefined): number {
  if (value === undefined) return Number.POSITIVE_INFINITY
  if (!Number.isSafeInteger(value) || value <= 0) return 1
  return Math.min(
    value,
    REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET *
      REQUEST_INSIGHT_RETENTION_BUCKETS.length
  )
}

function normalizeRequestInsightsLimits(
  options: RequestInsightsOptions
): RequestInsightsLimits {
  return {
    maxBytesPerRetentionBucket: normalizeNonNegativeInteger(
      options.maxBytesPerRetentionBucket,
      REQUEST_INSIGHTS_MAX_BYTES_PER_RETENTION_BUCKET
    ),
    maxRetainedBytes: normalizeNonNegativeInteger(
      options.maxRetainedBytes,
      REQUEST_INSIGHTS_MAX_RETAINED_BYTES
    ),
    maxRequestGroupsPerBucket: normalizeNonNegativeInteger(
      options.maxRequestGroupsPerBucket,
      REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET
    ),
    maxSnapshotBytes: Math.max(
      MIN_REQUEST_INSIGHTS_SNAPSHOT_BYTES,
      normalizeNonNegativeInteger(
        options.maxSnapshotBytes,
        REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES
      )
    ),
  }
}

function cloneCaptureState(
  capture: RequestInsightsCaptureState
): RequestInsightsCaptureState {
  return {
    limits: { ...capture.limits },
    usage: {
      ...capture.usage,
      buckets: capture.usage.buckets.map((bucket) => ({ ...bucket })),
    },
  }
}

function normalizeCaptureGroupLimit(value: number | undefined): number {
  if (value === undefined) {
    return REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET
  }
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET
  ) {
    throw new RangeError(
      `Request Insights maxRequestGroupsPerBucket must be an integer from 1 to ${REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET}.`
    )
  }
  return value
}

function normalizeNonNegativeInteger(
  value: number | undefined,
  fallback: number
): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value) || value < 0) return fallback
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value))
}

function sanitizeFiniteNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getCurrentTimestamp(): number {
  return performance.timeOrigin + performance.now()
}

function getSerializedByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function hasSameRequestInsightOrder(
  left: readonly RequestInsight[],
  right: readonly RequestInsight[]
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (request, index) =>
        getRequestInsightKey(request) === getRequestInsightKey(right[index])
    )
  )
}

function cloneRequestInsight(insight: RequestInsight): RequestInsight {
  return {
    ...insight,
    response: insight.response
      ? {
          ...insight.response,
          error: insight.response.error
            ? { ...insight.response.error }
            : undefined,
        }
      : undefined,
    spans: insight.spans.map((span) => ({
      ...span,
      attributes: cloneAttributes(span.attributes),
      links: span.links?.map((link) => ({
        ...link,
        attributes: cloneAttributes(link.attributes),
      })),
      events: span.events?.map((event) => ({
        ...event,
        attributes: cloneAttributes(event.attributes),
      })),
      error: span.error ? { ...span.error } : undefined,
    })),
    fetches: insight.fetches.map((fetch) => ({ ...fetch })),
  }
}

function cloneAttributes(
  attributes: RequestInsightSpan['attributes']
): RequestInsightSpan['attributes'] {
  if (!attributes) return undefined
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.slice() : value,
    ])
  )
}

function getStringAttribute(value: AttributeValue | undefined) {
  return typeof value === 'string' ? value : undefined
}

function getNumberAttribute(value: AttributeValue | undefined) {
  return typeof value === 'number' ? value : undefined
}
