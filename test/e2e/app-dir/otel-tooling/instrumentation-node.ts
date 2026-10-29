import { trace } from '@opentelemetry/api'
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BatchSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace'
import type { SpanExporter } from '@opentelemetry/sdk-trace'
import { readFileSync } from 'node:fs'

let registrations = 0
let provider: TracerProvider
let registeredProvider: ReturnType<typeof trace.getTracerProvider>

async function send(body: unknown) {
  const response = await fetch(process.env.TOOLING_ENDPOINT!, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error('Test collector rejected traces')
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  registrations++
  const exporter: SpanExporter = {
    export(spans, callback) {
      void send({
        kind: 'spans',
        pid: process.pid,
        spans: spans.map((span) => ({
          name: span.name,
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          parentSpanId: span.parentSpanContext?.spanId,
          startTime: span.startTime,
          endTime: span.endTime,
          attributes: span.attributes,
        })),
      }).then(
        () => callback({ code: 0 }),
        (error) => callback({ code: 1, error })
      )
    },
    async shutdown() {},
  }
  provider = new TracerProvider({
    sampler:
      process.env.TOOLING_SAMPLER === 'off'
        ? new AlwaysOffSampler()
        : new AlwaysOnSampler(),
    spanProcessors: [
      new BatchSpanProcessor({
        exporter,
        maxQueueSize: 20000,
        maxExportBatchSize: 1000,
      }),
    ],
  })
  const installed = trace.setGlobalTracerProvider(provider)
  registeredProvider = trace.getTracerProvider()
  await send({
    kind: 'register',
    pid: process.pid,
    phase: process.env.NEXT_PHASE,
    installed,
    registrations,
    time: Date.now(),
  })
}

export async function flushTraces() {
  // This assertion is deliberately in the application hook: it proves ordering
  // at the real process boundary, not just after the test has stopped Next.
  const lines = readFileSync(process.env.TOOLING_TRACE_FILE!, 'utf8')
    .trim()
    .split('\n')
  const events = lines.flatMap((line) => JSON.parse(line))
  await provider.forceFlush()
  await send({
    kind: 'flush',
    pid: process.pid,
    registrations,
    identityStable: trace.getTracerProvider() === registeredProvider,
    localHasRoot: events.some(
      (event) =>
        event.name ===
        (process.env.NEXT_PHASE === 'phase-production-build'
          ? 'next-build'
          : 'start-dev-server')
    ),
  })
}
