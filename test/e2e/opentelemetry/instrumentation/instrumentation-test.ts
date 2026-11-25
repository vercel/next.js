import './instrumentation-polyfill'

import type {
  Context,
  TextMapGetter,
  TextMapSetter,
  TextMapPropagator,
} from '@opentelemetry/api'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import {
  Sampler,
  SamplingDecision,
  SimpleSpanProcessor,
  SpanExporter,
  ReadableSpan,
} from '@opentelemetry/sdk-trace-base'
import {
  CompositePropagator,
  ExportResult,
  ExportResultCode,
  W3CTraceContextPropagator,
  hrTimeToMicroseconds,
} from '@opentelemetry/core'

import { SavedSpan } from './constants'

const customKey = Symbol.for('opentelemetry.test/custom')
const forceFlushKey = Symbol.for('opentelemetry.test/forceFlush')

const serializeSpan = (span: ReadableSpan): SavedSpan => ({
  runtime: process.env.NEXT_RUNTIME,
  traceId: span.spanContext().traceId,
  parentId: span.parentSpanId,
  traceState: span.spanContext().traceState?.serialize(),
  name: span.name,
  id: span.spanContext().spanId,
  kind: span.kind,
  timestamp: hrTimeToMicroseconds(span.startTime),
  duration: hrTimeToMicroseconds(span.duration),
  attributes: span.attributes,
  status: span.status,
  events: span.events,
  links: span.links,
})

class TestExporter implements SpanExporter {
  private pendingExports = new Set<Promise<void>>()

  constructor(private port: number) {}

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    const pending = this.exportSpans(spans, resultCallback)
    this.pendingExports.add(pending)
    void pending.then(
      () => this.pendingExports.delete(pending),
      () => this.pendingExports.delete(pending)
    )
  }

  private async exportSpans(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): Promise<void> {
    try {
      const response = await fetch(`http://localhost:${this.port}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(spans.map(serializeSpan)),
      })
      try {
        await response.arrayBuffer()
      } catch (e) {
        // ignore.
      }
      if (response.status >= 400) {
        console.warn('WARN: TestExporter: response status:', response.status)
        resultCallback({
          code: ExportResultCode.FAILED,
          error: new Error(`http status ${response.status}`),
        })
        return
      }
      resultCallback({ code: ExportResultCode.SUCCESS })
    } catch (e) {
      console.warn('WARN: TestExporter: error:', e)
      resultCallback({ code: ExportResultCode.FAILED, error: e })
    }
  }
  shutdown(): Promise<void> {
    return Promise.resolve()
  }

  async forceFlush(): Promise<void> {
    // SimpleSpanProcessor does not await ordinary exports in forceFlush, so
    // drain this test exporter's pending HTTP requests explicitly.
    await Promise.all(this.pendingExports)
  }
}

export const register = () => {
  const contextManager = new AsyncLocalStorageContextManager()
  contextManager.enable()

  const provider = new BasicTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'test-next-app',
    }),
    sampler: new CustomSampler(),
  })

  if (!process.env.TEST_OTEL_COLLECTOR_PORT) {
    throw new Error('TEST_OTEL_COLLECTOR_PORT is not set')
  }
  const port = parseInt(process.env.TEST_OTEL_COLLECTOR_PORT)
  provider.addSpanProcessor(new SimpleSpanProcessor(new TestExporter(port)))

  provider.register({
    contextManager,
    propagator: new CompositePropagator({
      propagators: [new CustomPropagator(), new W3CTraceContextPropagator()],
    }),
  })
  ;(globalThis as typeof globalThis & Record<symbol, () => Promise<void>>)[
    forceFlushKey
  ] = () => provider.forceFlush()
}

class CustomPropagator implements TextMapPropagator {
  fields(): string[] {
    return ['x-custom']
  }

  inject(context: Context, carrier: unknown, setter: TextMapSetter): void {}

  extract(context: Context, carrier: unknown, getter: TextMapGetter): Context {
    const value = getter.get(carrier, 'x-custom')
    if (!value) {
      return context
    }
    return context.setValue(customKey, value)
  }
}

class CustomSampler implements Sampler {
  shouldSample(context) {
    const value = context.getValue(customKey)
    return {
      decision: SamplingDecision.RECORD_AND_SAMPLED,
      attributes: value ? { custom: value } : {},
    }
  }

  toString() {
    return 'CustomSampler'
  }
}
