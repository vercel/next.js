import { SpanKind } from '@opentelemetry/api'

export type SavedSpan = {
  runtime?: string
  traceId?: string
  parentId?: string
  traceState?: any
  name?: string
  id?: string
  kind?: SpanKind
  timestamp?: number
  duration?: number
  attributes?: Record<string, any>
  status?: any
  events?: any[]
  links?: any[]
}
