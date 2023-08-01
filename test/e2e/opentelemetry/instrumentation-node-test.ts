import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import {
  SimpleSpanProcessor,
  SpanExporter,
  ReadableSpan,
} from '@opentelemetry/sdk-trace-base'
import {
  ExportResult,
  ExportResultCode,
  hrTimeToMicroseconds,
} from '@opentelemetry/core'
import fs from 'fs-extra'

import { SavedSpan, traceFile } from './constants'
import path from 'path'
import url from 'url'

const serializeSpan = (span: ReadableSpan): SavedSpan => ({
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

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

class TestExporter implements SpanExporter {
  async export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ) {
    const traceFullPath = path.join(__dirname, traceFile)
    for (const span of spans) {
      await fs.appendFile(
        traceFullPath,
        JSON.stringify(serializeSpan(span)) + '\n'
      )
    }
    resultCallback({ code: ExportResultCode.SUCCESS })
  }
  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}

export const register = () => {
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'test-next-app',
    }),
  })

  provider.addSpanProcessor(new SimpleSpanProcessor(new TestExporter()))

  // Make sure to register you provider
  provider.register()

  // Creating this file will let our tests know that initialization is done
  fs.createFileSync('./' + traceFile)
}
