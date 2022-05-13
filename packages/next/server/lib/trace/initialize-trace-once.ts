import { warn } from '../../../build/output/log'
import { SpanProcessorConfig, TraceConfig } from './trace-config'
import { configureTracer } from './tracer'

/**
 * Creates a span processor.
 *
 */
const buildSpanProcessor = (
  options: SpanProcessorConfig,
  exporter: import('@opentelemetry/sdk-trace-base').SpanExporter
) => {
  const {
    SimpleSpanProcessor,
    BatchSpanProcessor,
  }: typeof import('@opentelemetry/sdk-trace-base') = require('next/dist/compiled/@opentelemetry/sdk-trace-base')

  const { processorType, ...spanProcessorOptions } = options

  switch (processorType) {
    case 'batch':
      return new BatchSpanProcessor(exporter, spanProcessorOptions)
    case 'simple':
      return new SimpleSpanProcessor(exporter)
    default:
      throw new Error('Unexpected span processor type specified')
  }
}

/**
 * Initialize underlying trace bindings as global trace provider.
 * This should be called earliest as possible before starting any instrumentation.
 * Any trace sent before will not be collected.
 *
 * Initialization can occur only once per whole process lifecycle. Subsequent request
 * to initialize will be ignored regardless of different configuration options.
 */
export const initializeTraceOnce = (() => {
  const {
    NodeTracerProvider,
  }: typeof import('@opentelemetry/sdk-trace-node') = require('next/dist/compiled/@opentelemetry/sdk-trace-node')
  const {
    ConsoleSpanExporter,
  }: typeof import('@opentelemetry/sdk-trace-base') = require('next/dist/compiled/@opentelemetry/sdk-trace-base')
  const {
    Resource,
  }: typeof import('@opentelemetry/resources') = require('next/dist/compiled/@opentelemetry/resources')
  const {
    SemanticResourceAttributes,
  }: typeof import('@opentelemetry/semantic-conventions') = require('next/dist/compiled/@opentelemetry/semantic-conventions')

  let provider:
    | import('@opentelemetry/sdk-trace-node').NodeTracerProvider
    | null = null

  return (config?: TraceConfig | undefined) => {
    if (!config) {
      return
    }

    if (!!provider) {
      warn('Trace provider is already initialized')
      return
    }

    provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
      }),
    })

    provider.addSpanProcessor(
      buildSpanProcessor(
        config.spanProcessorConfig ?? { processorType: 'simple' },
        new ConsoleSpanExporter()
      )
    )

    provider.register()
    configureTracer(config)

    Array.from(['SIGTERM', 'SIGINT'] as const).forEach((sig) => {
      process.on(sig, () => {
        if (provider) {
          let instance = provider
          provider = null

          instance.shutdown().catch((e) => {
            warn('Failed to terminate trace', e.toString())
          })
        }
      })
    })
  }
})()
