export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const opentelemetry = require('@opentelemetry/sdk-node')
    const {
      OTLPTraceExporter,
    } = require('@opentelemetry/exporter-trace-otlp-http')
    const { Resource } = require('@opentelemetry/resources')
    const {
      SemanticResourceAttributes,
    } = require('@opentelemetry/semantic-conventions')

    const sdk = new opentelemetry.NodeSDK({
      traceExporter: new OTLPTraceExporter({}),
      instrumentations: [],
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'my-next-app',
        [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
      }),
    })

    sdk.start()
  }
}
