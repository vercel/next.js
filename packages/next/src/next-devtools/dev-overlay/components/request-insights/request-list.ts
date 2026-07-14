import type { RequestInsight } from '../../../shared/request-insights'

export function isPageLoadRequest(
  request: Pick<RequestInsight, 'requestId'>,
  initialRequestId: string | undefined
): boolean {
  return request.requestId === initialRequestId
}
