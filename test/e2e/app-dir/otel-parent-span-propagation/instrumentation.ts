import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import {
  SimpleSpanProcessor,
  SpanExporter,
  ReadableSpan,
  BasicTracerProvider,
} from '@opentelemetry/sdk-trace-base'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import {
  ExportResult,
  ExportResultCode,
  hrTimeToMicroseconds,
} from '@opentelemetry/core'

import { SavedSpan } from './constants'

const serializeSpan = (span: ReadableSpan): SavedSpan => ({
  runtime: process.env.NEXT_RUNTIME,
  traceId: span.spanContext().traceId,
  parentId: span.parentSpanId,
  name: span.name,
  id: span.spanContext().spanId,
  kind: span.kind,
  timestamp: hrTimeToMicroseconds(span.startTime),
  duration: hrTimeToMicroseconds(span.duration),
  attributes: span.attributes,
  status: span.status,
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
        resultCallback({
          code: ExportResultCode.FAILED,
          error: new Error(`http status ${response.status}`),
        })
        return
      }
      resultCallback({ code: ExportResultCode.SUCCESS })
    } catch (e) {
      resultCallback({ code: ExportResultCode.FAILED, error: e })
    }
  }
  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}

export async function register() {
  if (!process.env.TEST_OTEL_COLLECTOR_PORT) {
    throw new Error('TEST_OTEL_COLLECTOR_PORT is not set')
  }
  const port = parseInt(process.env.TEST_OTEL_COLLECTOR_PORT)

  const contextManager = new AsyncLocalStorageContextManager()
  contextManager.enable()

  const provider = new BasicTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'test-next-app',
    }),
  })

  provider.addSpanProcessor(new SimpleSpanProcessor(new TestExporter(port)))

  provider.register({
    contextManager,
  })
}
