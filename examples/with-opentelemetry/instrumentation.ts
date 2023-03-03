export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { tracing } = require('@opentelemetry/sdk-node')
    const { Resource } = require('@opentelemetry/resources')
    const {
      SemanticResourceAttributes,
    } = require('@opentelemetry/semantic-conventions')

    const { NodeTracerProvider, SimpleSpanProcessor } =
      require('@opentelemetry/sdk-trace-node') as typeof import('@opentelemetry/sdk-trace-node')
    const {
      OTLPTraceExporter,
    } = require('@opentelemetry/exporter-trace-otlp-grpc')

    // const exporter =new OTLPTraceExporter()
    const exporter = new tracing.ConsoleSpanExporter()

    const provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'next-app',
      }),
    })

    provider.addSpanProcessor(new SimpleSpanProcessor(exporter))

    provider.register()
  }
}
