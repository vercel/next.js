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

export function isPageLoadRequest(
  request: Pick<RequestInsight, 'requestId' | 'kind'>,
  initialRequestId: string | undefined
): boolean {
  return (
    getRequestInsightKind(request) === 'request' &&
    request.requestId === initialRequestId
  )
}
