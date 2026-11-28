import { SavedSpan } from './constants'

const SPAN_STATUS_ERROR = 2

/**
 * Fails if a trace whose request succeeded (every root
 * `BaseServer.handleRequest` span has `http.status_code` < 400) contains a span
 * with an ERROR status. Traces without a collected root request span are
 * skipped, as are traces whose root request span matches `ignore`.
 */
export function assertNoErrorSpansInSuccessfulTraces(
  spans: SavedSpan[],
  { ignore = () => false }: { ignore?: (root: SavedSpan) => boolean } = {}
) {
  const traces = new Map<string, SavedSpan[]>()
  for (const span of spans) {
    if (!span.traceId) continue
    let trace = traces.get(span.traceId)
    if (!trace) {
      trace = []
      traces.set(span.traceId, trace)
    }
    trace.push(span)
  }

  const errorSpans: Pick<SavedSpan, 'traceId' | 'name' | 'status'>[] = []
  for (const trace of traces.values()) {
    const ids = new Set(trace.map((span) => span.id))
    const roots = trace.filter(
      (span) =>
        span.attributes?.['next.span_type'] === 'BaseServer.handleRequest' &&
        !(span.parentId && ids.has(span.parentId))
    )
    const successful =
      roots.length > 0 &&
      roots.every((root) => {
        const statusCode = root.attributes?.['http.status_code']
        return (
          typeof statusCode === 'number' && statusCode < 400 && !ignore(root)
        )
      })
    if (!successful) continue

    for (const span of trace) {
      if (span.status?.code === SPAN_STATUS_ERROR) {
        errorSpans.push({
          traceId: span.traceId,
          name: span.name,
          status: span.status,
        })
      }
    }
  }

  expect(errorSpans).toEqual([])
}
