import {
  getRequestInsightKey,
  getRequestInsightKind,
  type RequestInsight,
} from '../../../shared/request-insights'

export function getActiveRequestKey(
  requests: readonly RequestInsight[],
  selectedRequestKey: string | null
): string | null {
  if (
    selectedRequestKey !== null &&
    requests.some(
      (request) => getRequestInsightKey(request) === selectedRequestKey
    )
  ) {
    return selectedRequestKey
  }

  const request =
    requests.find((item) => item.fetches.length > 0) ?? requests[0]
  return request ? getRequestInsightKey(request) : null
}

export function isInternalRequestInsight(
  request: Pick<RequestInsight, 'kind'>
): boolean {
  return getRequestInsightKind(request) !== 'request'
}

export type RequestListEntry = {
  request: RequestInsight
  nested: boolean
}

export function getRequestListEntries(
  requests: readonly RequestInsight[],
  showInternal: boolean
): RequestListEntry[] {
  if (!showInternal) {
    return requests
      .filter((request) => !isInternalRequestInsight(request))
      .map((request) => ({ request, nested: false }))
  }

  // Group internal records by the request they belong to, and record which
  // request ids have a parent (non-internal) record present, both in one pass.
  const internalByRequestId = new Map<string, RequestInsight[]>()
  const parentRequestIds = new Set<string>()
  for (const request of requests) {
    if (isInternalRequestInsight(request)) {
      const group = internalByRequestId.get(request.requestId)
      if (group) {
        group.push(request)
      } else {
        internalByRequestId.set(request.requestId, [request])
      }
    } else {
      parentRequestIds.add(request.requestId)
    }
  }

  const entries: RequestListEntry[] = []
  for (const request of requests) {
    if (isInternalRequestInsight(request)) {
      // Orphans (no parent request in the list) remain top-level and preserve
      // their ordering relative to other top-level records. Nested internal
      // records are emitted under their request below.
      if (!parentRequestIds.has(request.requestId)) {
        entries.push({ request, nested: false })
      }
      continue
    }

    entries.push({ request, nested: false })
    const nested = internalByRequestId.get(request.requestId)
    if (nested) {
      for (const internalRequest of nested) {
        entries.push({ request: internalRequest, nested: true })
      }
    }
  }
  return entries
}

export function isPageLoadRequest(
  request: Pick<RequestInsight, 'requestId' | 'kind'>,
  initialRequestId: string | undefined
): boolean {
  return (
    getRequestInsightKind(request) === 'request' &&
    request.requestId === initialRequestId
  )
}
