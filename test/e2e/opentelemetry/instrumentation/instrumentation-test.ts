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
  constructor(private port: number) {}

  async export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ) {
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
      }
    } catch (e) {
      console.warn('WARN: TestExporterP: error:', e)
      resultCallback({ code: ExportResultCode.FAILED, error: e })
    }

    resultCallback({ code: ExportResultCode.SUCCESS })
  }
  shutdown(): Promise<void> {
    return Promise.resolve()
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
