export type RequestInsightOperation = {
  id: number
  parentId?: number
  type: string
  name: string
  category: 'nextjs' | 'application'
  startTime: number
  durationMs: number
  status: 'ok' | 'error'
  error?: {
    type?: string
    message?: string
  }
}

export type RequestInsightFetch = {
  id: number
  parentOperationId?: number
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
  htmlRequestId: string
  route?: string
  url?: string
  method?: string
  statusCode?: number
  isRsc?: boolean
  startTime: number
  durationMs: number
  status: 'ok' | 'error'
  operations: RequestInsightOperation[]
  fetches: RequestInsightFetch[]
}

export type RequestInsightsSnapshot = {
  requests: RequestInsight[]
}
