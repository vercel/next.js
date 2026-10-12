export type RequestInsightKind = 'request' | 'instant-insights'

export type RequestInsightIdentity = {
  requestId: string
  kind?: RequestInsightKind
}

export function getRequestInsightKind(
  insight: Pick<RequestInsightIdentity, 'kind'>
): RequestInsightKind {
  return insight.kind ?? 'request'
}

export function getRequestInsightKey(insight: RequestInsightIdentity): string {
  return `${getRequestInsightKind(insight)}:${insight.requestId}`
}
