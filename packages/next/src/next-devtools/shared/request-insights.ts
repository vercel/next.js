import {
  getRequestInsightKind,
  getRequestInsightRootId,
  getRequestInsightRetentionBucket,
  REQUEST_INSIGHT_RETENTION_BUCKETS,
  type RequestInsightKind,
  type RequestInsightProxyStatus,
  type RequestInsightRetentionBucket,
  type RequestInsightRouterActivity,
  type RequestInsightSource,
} from '../../shared/lib/request-insights'

export const REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET = 200
export const REQUEST_INSIGHTS_MAX_BYTES_PER_RETENTION_BUCKET =
  18.75 * 1024 * 1024
export const REQUEST_INSIGHTS_MAX_RETAINED_BYTES = 93.75 * 1024 * 1024
export const REQUEST_INSIGHTS_MAX_RECORDS_PER_GROUP = 15
export const REQUEST_INSIGHTS_MAX_SPANS_PER_RECORD = 200
export const REQUEST_INSIGHTS_MAX_FETCHES_PER_RECORD = 200
export const REQUEST_INSIGHTS_MAX_BYTES_PER_RECORD = 64 * 1024
export const REQUEST_INSIGHTS_MAX_BYTES_PER_SPAN = 8 * 1024
export const REQUEST_INSIGHTS_MAX_EVENTS_PER_SPAN = 16
export const REQUEST_INSIGHTS_MAX_LINKS_PER_SPAN = 8
export const REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024

export {
  getRequestInsightKey,
  getRequestInsightKind,
  getRequestInsightRetentionBucket,
  getRequestInsightRootId,
  getRequestInsightSource,
  REQUEST_INSIGHT_PROXY_SPAN_TYPE,
  REQUEST_INSIGHT_REQUEST_SPAN_TYPE,
  REQUEST_INSIGHT_RETENTION_BUCKETS,
  type RequestInsightIdentity,
  type RequestInsightKind,
  type RequestInsightProxyStatus,
  type RequestInsightRetentionBucket,
  type RequestInsightRouterActivity,
  type RequestInsightSource,
} from '../../shared/lib/request-insights'

export type RequestInsightAttributeValue =
  | string
  | number
  | boolean
  | Array<null | undefined | string>
  | Array<null | undefined | number>
  | Array<null | undefined | boolean>

export type RequestInsightSpan = {
  name: string
  startTime: number
  durationMs?: number
  status?: 'ok' | 'error'
  traceId?: string
  spanId?: string
  parentSpanId?: string
  attributes?: Record<string, RequestInsightAttributeValue>
  links?: Array<{
    traceId: string
    spanId: string
    attributes?: Record<string, RequestInsightAttributeValue>
  }>
  events?: Array<{
    name: string
    timestamp: number
    attributes?: Record<string, RequestInsightAttributeValue>
  }>
  error?: {
    type?: string
    message?: string
  }
  truncatedMetadataValueCount?: number
  truncatedEventCount?: number
  truncatedLinkCount?: number
}

export type RequestInsightFetch = {
  url?: string
  method?: string
  statusCode?: number
  startTime?: number
  durationMs?: number
  cacheStatus?: string
  cacheReason?: string
  index?: number
}

export type RequestInsight = {
  requestId: string
  rootRequestId?: string
  kind?: RequestInsightKind
  source: RequestInsightSource
  proxyStatus?: RequestInsightProxyStatus
  routerActivity?: RequestInsightRouterActivity
  serverAction?: true
  htmlRequestId: string
  route?: string
  url?: string
  startTime: number
  durationMs?: number
  status: 'ok' | 'error' | 'pending'
  spans: RequestInsightSpan[]
  fetches: RequestInsightFetch[]
  truncatedSpanCount?: number
  truncatedFetchCount?: number
  omittedRequestCount?: number
}

export type RequestInsightsCaptureState = {
  limits: {
    maxRequestGroupsPerBucket: number
    maxBytesPerBucket: number
    maxRetainedBytes: number
    maxRecordsPerGroup: number
    maxSpansPerRecord: number
    maxFetchesPerRecord: number
    maxBytesPerRecord: number
    maxBytesPerSpan: number
    maxEventsPerSpan: number
    maxLinksPerSpan: number
    maxSnapshotBytes: number
  }
  usage: {
    retainedRequestGroupCount: number
    retainedRequestCount: number
    retainedBytes: number
    buckets: Array<{
      bucket: RequestInsightRetentionBucket
      retainedRequestGroupCount: number
      retainedRequestCount: number
      retainedBytes: number
      evictedRequestGroupCount: number
    }>
  }
}

export type RequestInsightsSnapshot = {
  requests: RequestInsight[]
  capture?: RequestInsightsCaptureState
  projection?: {
    omittedRequestGroupCount: number
    buckets: Array<{
      bucket: RequestInsightRetentionBucket
      omittedRequestGroupCount: number
    }>
  }
}

export type BoundedRequestInsightsSnapshotProjection = {
  snapshot: RequestInsightsSnapshot
  snapshotByteLength: number
}

/**
 * Selects a bucket-fair set of newest logical roots that fits one serialized
 * snapshot. A bucket stops at its first root that does not fit, so its result
 * always remains a newest contiguous suffix.
 */
export function createBoundedRequestInsightsSnapshotProjection(
  groups: readonly (readonly RequestInsight[])[],
  maxSnapshotBytes: number,
  capture?: RequestInsightsCaptureState,
  maxRetainedGroupCount = Number.POSITIVE_INFINITY
): BoundedRequestInsightsSnapshotProjection {
  type IndexedGroup = {
    group: readonly RequestInsight[]
    index: number
    byteLength: number
    bucket: RequestInsightRetentionBucket
  }

  const groupsByBucket = new Map<
    RequestInsightRetentionBucket,
    IndexedGroup[]
  >()
  const availableGroupCountByBucket = new Map<
    RequestInsightRetentionBucket,
    number
  >()
  const indexedGroups: IndexedGroup[] = []

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]
    if (group.length === 0) continue
    const bucket = getRequestInsightRetentionBucket(
      getRequestInsightGroupRepresentative(group)
    )
    const indexedGroup = {
      group,
      index,
      byteLength: getRequestInsightsSerializedByteLength(group),
      bucket,
    }
    indexedGroups.push(indexedGroup)
    const bucketGroups = groupsByBucket.get(bucket)
    if (bucketGroups) {
      bucketGroups.push(indexedGroup)
    } else {
      groupsByBucket.set(bucket, [indexedGroup])
    }
    availableGroupCountByBucket.set(
      bucket,
      (availableGroupCountByBucket.get(bucket) ?? 0) + 1
    )
  }

  const retainedGroups: IndexedGroup[] = []
  const retainedGroupCountByBucket = new Map<
    RequestInsightRetentionBucket,
    number
  >()
  const exhaustedBuckets = new Set<RequestInsightRetentionBucket>()
  let retainedGroupContentsByteLength = 0

  for (let depth = 0; ; depth++) {
    const candidates: IndexedGroup[] = []
    for (const [bucket, bucketGroups] of groupsByBucket) {
      if (exhaustedBuckets.has(bucket)) continue
      const candidate = bucketGroups[bucketGroups.length - 1 - depth]
      if (candidate) candidates.push(candidate)
    }
    if (candidates.length === 0) break

    candidates.sort((left, right) => right.index - left.index)
    for (const candidate of candidates) {
      if (retainedGroups.length >= maxRetainedGroupCount) break
      const nextRetainedCountByBucket = new Map(retainedGroupCountByBucket)
      nextRetainedCountByBucket.set(
        candidate.bucket,
        (nextRetainedCountByBucket.get(candidate.bucket) ?? 0) + 1
      )
      if (
        getProjectedSnapshotByteLength(
          retainedGroupContentsByteLength + candidate.byteLength - 2,
          retainedGroups.length + 1,
          availableGroupCountByBucket,
          nextRetainedCountByBucket,
          capture
        ) > maxSnapshotBytes
      ) {
        exhaustedBuckets.add(candidate.bucket)
        continue
      }
      retainedGroupContentsByteLength += candidate.byteLength - 2
      retainedGroups.push(candidate)
      retainedGroupCountByBucket.set(
        candidate.bucket,
        (retainedGroupCountByBucket.get(candidate.bucket) ?? 0) + 1
      )
    }
    if (retainedGroups.length >= maxRetainedGroupCount) break
  }

  const retainedGroupIndexes = new Set(
    retainedGroups.map((retainedGroup) => retainedGroup.index)
  )
  const orderedRetainedGroups = indexedGroups.filter((indexedGroup) =>
    retainedGroupIndexes.has(indexedGroup.index)
  )
  const snapshot = createSnapshot(
    orderedRetainedGroups,
    availableGroupCountByBucket,
    retainedGroupCountByBucket,
    capture
  )
  const snapshotByteLength = getRequestInsightsSerializedByteLength(snapshot)

  return { snapshot, snapshotByteLength }
}

function getRequestInsightGroupRepresentative(
  group: readonly RequestInsight[]
): RequestInsight {
  const rootRequestId = getRequestInsightRootId(group[0])
  return (
    group.find(
      (request) =>
        request.requestId === rootRequestId &&
        getRequestInsightKind(request) === 'request'
    ) ??
    group.find((request) => getRequestInsightKind(request) === 'request') ??
    group[0]
  )
}

function getProjectedSnapshotByteLength(
  retainedGroupContentsByteLength: number,
  retainedGroupCount: number,
  availableGroupCountByBucket: ReadonlyMap<
    RequestInsightRetentionBucket,
    number
  >,
  retainedGroupCountByBucket: ReadonlyMap<
    RequestInsightRetentionBucket,
    number
  >,
  capture?: RequestInsightsCaptureState
): number {
  const requestsByteLength =
    2 + retainedGroupContentsByteLength + Math.max(0, retainedGroupCount - 1)
  const emptySnapshot = createSnapshotFromCounts(
    [],
    availableGroupCountByBucket,
    retainedGroupCountByBucket,
    capture
  )
  return (
    getRequestInsightsSerializedByteLength(emptySnapshot) -
    getRequestInsightsSerializedByteLength(emptySnapshot.requests) +
    requestsByteLength
  )
}

function createSnapshot(
  retainedGroups: readonly {
    group: readonly RequestInsight[]
    bucket: RequestInsightRetentionBucket
  }[],
  availableGroupCountByBucket: ReadonlyMap<
    RequestInsightRetentionBucket,
    number
  >,
  retainedGroupCountByBucket: ReadonlyMap<
    RequestInsightRetentionBucket,
    number
  >,
  capture?: RequestInsightsCaptureState
): RequestInsightsSnapshot {
  return createSnapshotFromCounts(
    retainedGroups.flatMap(({ group }) => [...group]),
    availableGroupCountByBucket,
    retainedGroupCountByBucket,
    capture
  )
}

function createSnapshotFromCounts(
  requests: RequestInsight[],
  availableGroupCountByBucket: ReadonlyMap<
    RequestInsightRetentionBucket,
    number
  >,
  retainedGroupCountByBucket: ReadonlyMap<
    RequestInsightRetentionBucket,
    number
  >,
  capture?: RequestInsightsCaptureState
): RequestInsightsSnapshot {
  const projectionBuckets = REQUEST_INSIGHT_RETENTION_BUCKETS.flatMap(
    (bucket) => {
      const omittedRequestGroupCount = Math.max(
        0,
        (availableGroupCountByBucket.get(bucket) ?? 0) -
          (retainedGroupCountByBucket.get(bucket) ?? 0)
      )
      return omittedRequestGroupCount > 0
        ? [{ bucket, omittedRequestGroupCount }]
        : []
    }
  )
  const omittedRequestGroupCount = projectionBuckets.reduce(
    (total, bucket) => total + bucket.omittedRequestGroupCount,
    0
  )

  return {
    requests,
    ...(capture ? { capture } : undefined),
    ...(omittedRequestGroupCount > 0
      ? {
          projection: {
            omittedRequestGroupCount,
            buckets: projectionBuckets,
          },
        }
      : undefined),
  }
}

export function getRequestInsightsSerializedByteLength(value: unknown): number {
  const serialized = JSON.stringify(value) ?? ''
  let byteLength = 0
  for (let index = 0; index < serialized.length; index++) {
    const codeUnit = serialized.charCodeAt(index)
    if (codeUnit <= 0x7f) {
      byteLength++
    } else if (codeUnit <= 0x7ff) {
      byteLength += 2
    } else if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      index + 1 < serialized.length &&
      serialized.charCodeAt(index + 1) >= 0xdc00 &&
      serialized.charCodeAt(index + 1) <= 0xdfff
    ) {
      byteLength += 4
      index++
    } else {
      byteLength += 3
    }
  }
  return byteLength
}
