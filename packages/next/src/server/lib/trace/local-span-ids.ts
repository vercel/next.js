import type { LocalSpanParent, SpanStoreRecord } from './span-store'

export const SPAN_ID_HEX_LENGTH = 16

let lastLocalSpanId = 0

export function nextLocalSpanId(): number {
  return ++lastLocalSpanId
}

export function createLocalSpanId(excludedId?: string): string {
  let spanId: string
  do {
    spanId = nextLocalSpanId().toString(16).padStart(SPAN_ID_HEX_LENGTH, '0')
  } while (spanId === excludedId)
  return spanId
}

export function reparentLocalSpans(
  parent: LocalSpanParent,
  spans: readonly SpanStoreRecord[]
): SpanStoreRecord[] {
  const importedIds = new Map<string, string>()
  const key = (traceId: string, spanId: string) => `${traceId}:${spanId}`
  for (const span of spans) {
    if (span.traceId && span.spanId) {
      importedIds.set(
        key(span.traceId, span.spanId),
        createLocalSpanId(parent.spanId)
      )
    }
  }

  return spans.map((span) => ({
    ...span,
    traceId: parent.traceId,
    spanId:
      (span.traceId && span.spanId
        ? importedIds.get(key(span.traceId, span.spanId))
        : undefined) ?? createLocalSpanId(parent.spanId),
    parentSpanId:
      (span.traceId && span.parentSpanId
        ? importedIds.get(key(span.traceId, span.parentSpanId))
        : undefined) ?? parent.spanId,
    links: span.links?.map((link) => {
      const spanId = importedIds.get(key(link.traceId, link.spanId))
      return spanId ? { ...link, traceId: parent.traceId, spanId } : link
    }),
  }))
}
