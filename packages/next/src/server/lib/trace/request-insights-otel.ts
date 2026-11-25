import { getRegisteredLocalSpanRecorder } from './local-span-recorder-registry'
import type { OpenTelemetryReadableSpan } from './span-store'

export interface RequestInsightsSpanProcessor {
  forceFlush(): Promise<void>
  onEnd(span: OpenTelemetryReadableSpan): void
  onStart(span: object, parentContext: unknown): void
  shutdown(): Promise<void>
}

class RequestInsightsSpanProcessorImpl implements RequestInsightsSpanProcessor {
  private readonly recorders = new WeakMap<
    object,
    (span: OpenTelemetryReadableSpan) => void
  >()

  onStart(span: object): void {
    const record =
      getRegisteredLocalSpanRecorder()?.captureOpenTelemetrySpanRecorder()
    if (record) {
      this.recorders.set(span, record)
    }
  }

  onEnd(span: OpenTelemetryReadableSpan): void {
    const record = this.recorders.get(span)
    this.recorders.delete(span)
    // Next.js spans are already recorded by the local span recorder.
    if (!record || typeof span.attributes['next.span_type'] === 'string') {
      return
    }

    try {
      record(span)
    } catch {
      // Diagnostics must not affect application spans.
    }
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}

export function createRequestInsightsSpanProcessor(): RequestInsightsSpanProcessor {
  return new RequestInsightsSpanProcessorImpl()
}
