import { registerOTel } from '@vercel/otel'
import { SpanData, hrTimeToMs, renderTrace } from './span-tree'

// Store spans by traceId until trace is complete
const traceSpans = new Map<string, SpanData[]>()
const pendingRenders = new Map<string, NodeJS.Timeout>()

const Processor = {
  forceFlush: async () => void 0,
  onStart: () => void 0,
  onEnding: () => void 0,

  onEnd: (span: any) => {
    const traceId = span._spanContext.traceId
    const spanId = span._spanContext.spanId
    const parentSpanId =
      span.parentSpanId ||
      span.parentSpanContext?.spanId ||
      span._parentSpanContext?.spanId

    // Extract useful attributes
    const attrs = span.attributes || {}
    const usefulAttrs: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(attrs)) {
      if (
        !key.startsWith('next.') ||
        key === 'next.segment' ||
        key === 'next.page' ||
        key === 'next.route'
      ) {
        usefulAttrs[key] = value
      }
    }

    const spanData: SpanData = {
      spanId,
      parentSpanId,
      name: span.name,
      startTime: hrTimeToMs(span.startTime),
      duration: hrTimeToMs(span.duration),
      attributes: Object.keys(usefulAttrs).length > 0 ? usefulAttrs : undefined,
    }

    // Collect span
    if (!traceSpans.has(traceId)) {
      traceSpans.set(traceId, [])
    }
    traceSpans.get(traceId)!.push(spanData)

    // When root span ends, schedule trace render
    if (!parentSpanId) {
      if (pendingRenders.has(traceId)) {
        clearTimeout(pendingRenders.get(traceId))
      }

      const timeout = setTimeout(() => {
        const spans = traceSpans.get(traceId)
        if (spans && spans.length > 0) {
          renderTrace(traceId, spans)
          traceSpans.delete(traceId)
          pendingRenders.delete(traceId)
        }
      }, 100)

      pendingRenders.set(traceId, timeout)
    }
  },

  shutdown: async () => void 0,
}

export function register() {
  console.log('register!')
  registerOTel({ serviceName: 'next-app', spanProcessors: [Processor] })
}
