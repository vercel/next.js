export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // const opentelemetry = require('@opentelemetry/sdk-node')
    // // const {
    // //   getNodeAutoInstrumentations,
    // // } = require('@opentelemetry/auto-instrumentations-node')

    // const {
    //   OTLPTraceExporter,
    // } = require('@opentelemetry/exporter-trace-otlp-http')
    // const {
    //   BasicTracerProvider,
    //   ConsoleSpanExporter,
    //   SimpleSpanProcessor,
    // } = require('@opentelemetry/sdk-trace-base')

    // const sdk = new opentelemetry.NodeSDK({
    //   traceExporter: new OTLPTraceExporter(),
    //   instrumentations: [],
    // })

    // sdk.
    // const {
    //   registerInstrumentations,
    // } = require('@opentelemetry/instrumentation')
    // const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')

    // Create and configure NodeTracerProvider
    // const provider = new NodeTracerProvider({
    //   traceExporter: [new ConsoleSpanExporter()],
    // })

    // Initialize the provider
    // provider.register()

    // register and load instrumentation and old plugins - old plugins will be loaded automatically as previously
    // but instrumentations needs to be added
    // registerInstrumentations({})
    const opentelemetry = require('@opentelemetry/sdk-node')
    // const {
    //   getNodeAutoInstrumentations,
    // } = require('@opentelemetry/auto-instrumentations-node')
    const {
      OTLPTraceExporter,
    } = require('@opentelemetry/exporter-trace-otlp-http')
    const { Resource } = require('@opentelemetry/resources')
    const {
      SemanticResourceAttributes,
    } = require('@opentelemetry/semantic-conventions')
    const sdk = new opentelemetry.NodeSDK({
      traceExporter: new OTLPTraceExporter({
        // optional - collection of custom headers to be sent with each request, empty by default
        headers: {},
      }),
      instrumentations: [],
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'next-app',
      }),
    })
    sdk.start()
    console.log('registered')
  }
}
