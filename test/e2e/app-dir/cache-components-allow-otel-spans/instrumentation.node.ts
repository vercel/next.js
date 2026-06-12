import { trace } from '@opentelemetry/api'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express'

// OTel instrumentation libraries acquire their tracer in their constructor
// (`InstrumentationAbstract` calls `trace.getTracer()`), before the SDK
// registers the tracer provider. Such a tracer is a ProxyTracer that resolves
// the actual tracer through `ProxyTracerProvider.getDelegateTracer()` instead
// of `getTracer()`. We stash one here, before `sdk.start()`, to simulate that
// pattern; app/traced-work.tsx creates spans with it.
;(globalThis as any).__earlyTracer = trace.getTracer('early-tracer')

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
