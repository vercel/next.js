import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import {
  ExportResult,
  ExportResultCode,
  hrTimeToMicroseconds,
} from '@opentelemetry/core'
import { Resource } from '@opentelemetry/resources'
import {
  BasicTracerProvider,
  type ReadableSpan,
  SimpleSpanProcessor,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

type SavedSpan = {
  runtime?: string
  traceId?: string
  parentId?: string
  traceState?: string
  name?: string
  id?: string
  kind?: number
  timestamp?: number
  duration?: number
  attributes?: Record<string, unknown>
  status?: unknown
  events?: unknown[]
  links?: unknown[]
}

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
      } catch {}

      resultCallback({
        code:
          response.status >= 400
            ? ExportResultCode.FAILED
            : ExportResultCode.SUCCESS,
      })
    } catch (error) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}

export function register() {
  const port = Number(process.env.TEST_OTEL_COLLECTOR_PORT)

  if (!port) {
    throw new Error('TEST_OTEL_COLLECTOR_PORT is not set')
  }

  const contextManager = new AsyncLocalStorageContextManager()
  contextManager.enable()

  const provider = new BasicTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'test-cache-components-otel',
    }),
  })

  provider.addSpanProcessor(new SimpleSpanProcessor(new TestExporter(port)))
  provider.register({ contextManager })
}
