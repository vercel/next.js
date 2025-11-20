import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import {
  ExportResult,
  ExportResultCode,
  hrTimeToMicroseconds,
} from '@opentelemetry/core'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'

interface SerializedSpan {
  runtime: string | undefined
  traceId: string
  parentId: string | undefined
  traceState: string | undefined
  name: string
  id: string
  kind: number
  timestamp: number
  duration: number
  attributes: Record<string, unknown>
  status: { code: number; message?: string }
  events: ReadableSpan['events']
  links: ReadableSpan['links']
}

const serializeSpan = (span: ReadableSpan): SerializedSpan => ({
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
  private port: string

  constructor(port: string) {
    this.port = port
  }

  async export(
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
        // ignore
      }
      if (response.status >= 400) {
        console.warn('WARN: TestExporter: response status:', response.status)
        return resultCallback({
          code: ExportResultCode.FAILED,
          error: new Error(`http status ${response.status}`),
        })
      }
    } catch (e) {
      console.warn('WARN: TestExporter: error:', e)
      return resultCallback({
        code: ExportResultCode.FAILED,
        error: e as Error,
      })
    }

    resultCallback({ code: ExportResultCode.SUCCESS })
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}

export function register() {
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'custom-server-test',
    }),
  })

  const port = process.env.TEST_OTEL_COLLECTOR_PORT

  if (!port) {
    throw new Error('TEST_OTEL_COLLECTOR_PORT is not set')
  }

  provider.addSpanProcessor(new SimpleSpanProcessor(new TestExporter(port)))

  provider.register()
}
