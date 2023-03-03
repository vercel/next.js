export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
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

    const provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'next-app',
      }),
    })

    // You can use either HTTP or GRPC to send traces to the collector
    const useGrpc = true
    if (!useGrpc) {
      provider.addSpanProcessor(
        new SimpleSpanProcessor(new OTLPTraceExporterHTTP({}))
      )
    } else {
      provider.addSpanProcessor(
        new SimpleSpanProcessor(new OTLPTraceExporterGRPC({}))
      )
    }

    provider.register()
  }
}
