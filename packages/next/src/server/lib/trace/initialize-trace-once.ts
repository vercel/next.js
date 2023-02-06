import { warn } from '../../../build/output/log'
import { SpanProcessorConfig, TraceConfig } from './trace-config'
import { configureTracer } from './tracer'
import type { OTLPExporterNodeConfigBase } from '@opentelemetry/otlp-exporter-base'
import * as Log from '../../../build/output/log'

const {
  diag,
  DiagLogLevel,
}: typeof import('@opentelemetry/api') = require('next/dist/compiled/@opentelemetry/api')
const {
  OTLPTraceExporter,
}: typeof import('@opentelemetry/exporter-trace-otlp-http') = require('next/dist/compiled/@opentelemetry/exporter-trace-otlp-http')

/**
 * Options to create exporter to collector using otlp-grpc.
 * Most of configurations can be controlled via environment variables as well -
 * refer
 * https://github.com/open-telemetry/opentelemetry-js/blob/bd9159a35331406cbbd790c0d4542b1cebf3b442/experimental/packages/exporter-trace-otlp-grpc/README.md#environment-variable-configuration
 * for more details.
 *
 * TODO: Figure out what kind of options we'll expose to configure.
 */
const collectorOptions: OTLPExporterNodeConfigBase = {}

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

    diag.setLogger(
      {
        error: Log.error.bind(Log),
        warn: Log.warn.bind(Log),
        info: Log.info.bind(Log),
        debug: Log.info.bind(Log),
        verbose: Log.trace.bind(Log),
      },
      DiagLogLevel.ERROR
    )

    provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
        // TODO: These are recommended resource attributes to be included
        // (https://github.com/open-telemetry/opentelemetry-specification/blob/ea61daeeaf8a3770a5189528abc09f25b87c7531/specification/resource/semantic_conventions/README.md#service)
        // which we may need to expose in config.
        [SemanticResourceAttributes.SERVICE_NAMESPACE]: undefined,
        [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: undefined,
        [SemanticResourceAttributes.SERVICE_VERSION]: undefined,
      }),
    })

    if (!!config?.debug) {
      warn(`Debug mode is enabled. Spans will be emitted into console.`)
    }

    const exporter = !!config?.debug
      ? new ConsoleSpanExporter()
      : new OTLPTraceExporter(collectorOptions)

    provider.addSpanProcessor(
      buildSpanProcessor(
        config.spanProcessorConfig ?? { processorType: 'simple' },
        exporter
      )
    )

    // This'll internally register provider as global,
    // allows app can acquire it from global registry to insert spans connected with current provider.
    provider.register()
    configureTracer({ provider, ...config })

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
