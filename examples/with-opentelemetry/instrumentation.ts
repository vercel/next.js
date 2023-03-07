export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // We need to make sure that we import these files only in Node.js environment.
    // OpenTelemetry is **not** supported on Edge or Client side at the moment.
    const { Resource } = require('@opentelemetry/resources')
    const {
      SemanticResourceAttributes,
    } = require('@opentelemetry/semantic-conventions')
    const { NodeTracerProvider, SimpleSpanProcessor } =
      require('@opentelemetry/sdk-trace-node') as typeof import('@opentelemetry/sdk-trace-node')
    const {
      OTLPTraceExporter: OTLPTraceExporterGRPC,
    } = require('@opentelemetry/exporter-trace-otlp-grpc')
    const {
      OTLPTraceExporter: OTLPTraceExporterHTTP,
    } = require('@opentelemetry/exporter-trace-otlp-http')

    // Next.js expects you to use to register TraceProvider. It won't work if you use NodeSDK instead.
    // We use registered provider to create traces inside of Next.js internals.
    const provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'next-app',
      }),
    })

    // Open Telemetry supports http and grpc exporters.
    provider.addSpanProcessor(
      new SimpleSpanProcessor(new OTLPTraceExporterHTTP({}))
    )

    // Make sure to register you provider
    provider.register()
  }
}
