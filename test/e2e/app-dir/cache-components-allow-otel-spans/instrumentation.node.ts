import { trace, type Tracer } from '@opentelemetry/api'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express'

type TestGlobal = typeof globalThis & {
  __nextTestEarlyTracer?: Tracer
}

// Acquire this before sdk.start() to reproduce how instrumentation libraries
// receive a ProxyTracer before the real provider is registered.
;(globalThis as TestGlobal).__nextTestEarlyTracer ??= trace.getTracer(
  'next-test-early-tracer'
)

const sdk = new NodeSDK({
  serviceName: 'nextjs-otel-app',
  traceExporter: new OTLPTraceExporter({
    url:
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
      'http://localhost:4318/v1/traces',
  }),
  instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
})

sdk.start()
