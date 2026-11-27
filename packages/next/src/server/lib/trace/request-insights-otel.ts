import { getRegisteredLocalSpanRecorder } from './local-span-recorder-registry'
import type { SpanStoreAttributeValue } from './span-store'

type OpenTelemetryHrTime = [number, number]
type OpenTelemetrySpanContext = { traceId: string; spanId: string }
type OpenTelemetryAttributes = Partial<Record<string, SpanStoreAttributeValue>>

// Structural subset of the SDK's `ReadableSpan`; kept free of
// `@opentelemetry/*` imports so the public typings resolve without them.
export type OpenTelemetryReadableSpan = {
  name: string
  spanContext(): OpenTelemetrySpanContext
  parentSpanContext?: OpenTelemetrySpanContext
  // sdk-trace-base 1.x
  parentSpanId?: string
  startTime: OpenTelemetryHrTime
  duration: OpenTelemetryHrTime
  status: { code: number; message?: string }
  attributes: OpenTelemetryAttributes
  events: ReadonlyArray<{
    name: string
    time: OpenTelemetryHrTime
    attributes?: OpenTelemetryAttributes
  }>
  links: ReadonlyArray<{
    context: OpenTelemetrySpanContext
    attributes?: OpenTelemetryAttributes
  }>
}

export type RequestInsightsSpanProcessor = ReturnType<
  typeof createRequestInsightsSpanProcessor
>

export function createRequestInsightsSpanProcessor() {
  const recorders = new WeakMap<
    object,
    (span: OpenTelemetryReadableSpan) => void
  >()

  return {
    onStart(span: OpenTelemetryReadableSpan, _parentContext: unknown): void {
      // Next.js spans are already recorded by the local span recorder.
      if (typeof span.attributes['next.span_type'] === 'string') {
        return
      }
      const record =
        getRegisteredLocalSpanRecorder()?.captureOpenTelemetrySpanRecorder()
      if (record) {
        recorders.set(span, record)
      }
    },

    onEnd(span: OpenTelemetryReadableSpan): void {
      const record = recorders.get(span)
      if (!record) {
        return
      }
      recorders.delete(span)
      try {
        record(span)
      } catch {
        // Diagnostics must not affect application spans.
      }
    },

    async forceFlush(): Promise<void> {},

    async shutdown(): Promise<void> {},
  }
}
