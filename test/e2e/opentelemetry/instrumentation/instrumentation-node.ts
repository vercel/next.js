import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'

// You can use http exporter instead
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'

export function register() {
  // Next.js expects you to use to register TraceProvider. It won't work if you use NodeSDK.
  // We use registered provider to create traces inside of Next.js internals.
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'next-app',
    }),
  })

  provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter({})))

  // Make sure to register you provider
  provider.register()
}
