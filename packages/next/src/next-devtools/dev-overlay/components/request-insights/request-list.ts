import type { RequestInsight } from '../../../shared/request-insights'

export function getActiveRequestId(
  requests: readonly RequestInsight[],
  selectedRequestId: string | null
): string | null {
  if (
    selectedRequestId !== null &&
    requests.some((request) => request.requestId === selectedRequestId)
  ) {
    return selectedRequestId
  }

  return (
    requests.find((request) => request.fetches.length > 0)?.requestId ??
    requests[0]?.requestId ??
    null
  )
}

export function isPageLoadRequest(
  request: Pick<RequestInsight, 'requestId'>,
  initialRequestId: string | undefined
): boolean {
  return request.requestId === initialRequestId
}
