import { metrics, trace } from '@opentelemetry/api'
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace'
import type { SpanExporter } from '@opentelemetry/sdk-trace'
import { writeSync } from 'node:fs'

let registrations = 0
let registeredProvider: ReturnType<typeof trace.getTracerProvider>
// Observe live SDK parents without inventing an end for unfinished tooling work.
const unfinished = new Map<
  string,
  { name: string; spanId: string; traceId: string; toolingId: unknown }
>()

// A synchronous test exporter observes SDK delivery without relying on exit hooks.
function send(body: Record<string, unknown>) {
  writeSync(
    1,
    `[tooling-otel]${JSON.stringify({
      ...body,
      time: Date.now(),
      identityStable: trace.getTracerProvider() === registeredProvider,
      unfinished: [...unfinished.values()],
    })}\n`
  )
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  registrations++
  installProvider('register')
}

export function installProvider(kind: 'register' | 'provider' = 'provider') {
  const exporter: SpanExporter = {
    export(spans, callback) {
      send({
        kind: 'spans',
        pid: process.pid,
        spans: spans.map((span) => ({
          name: span.name,
          instrumentationScope: span.instrumentationScope.name,
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          parentSpanId: span.parentSpanContext?.spanId,
          startTime: span.startTime,
          endTime: span.endTime,
          attributes: span.attributes,
        })),
      })
      callback({ code: 0 })
    },
    async shutdown() {},
  }
  const provider = new TracerProvider({
    sampler:
      process.env.TOOLING_SAMPLER === 'off'
        ? new AlwaysOffSampler()
        : new AlwaysOnSampler(),
    spanProcessors: [
      {
        onStart(span) {
          const spanId = span.spanContext().spanId
          unfinished.set(spanId, {
            name: span.name,
            spanId,
            traceId: span.spanContext().traceId,
            toolingId: span.attributes['next.tooling.id'],
          })
        },
        onEnd(span) {
          unfinished.delete(span.spanContext().spanId)
        },
        async forceFlush() {},
        async shutdown() {},
      },
      new SimpleSpanProcessor({ exporter }),
    ],
  })
  const installed = trace.setGlobalTracerProvider(provider)
  const meterProvider = new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({
        exportIntervalMillis: 50,
        exporter: {
          export(resourceMetrics, callback) {
            send({
              kind: 'metrics',
              pid: process.pid,
              metrics: resourceMetrics.scopeMetrics.flatMap((scope) =>
                scope.metrics.map((metric) => ({
                  name: metric.descriptor.name,
                  unit: metric.descriptor.unit,
                  instrumentationScope: scope.scope.name,
                  dataPoints: metric.dataPoints,
                }))
              ),
            })
            callback({ code: 0 })
          },
          async forceFlush() {},
          async shutdown() {},
        },
      }),
    ],
  })
  const metricsInstalled = metrics.setGlobalMeterProvider(meterProvider)
  registeredProvider = trace.getTracerProvider()
  send({
    kind,
    pid: process.pid,
    phase: process.env.NEXT_PHASE,
    installed,
    metricsInstalled,
    registrations,
    time: Date.now(),
  })
}
