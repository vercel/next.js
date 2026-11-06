import type { Tracer } from '@opentelemetry/api'

let api: typeof import('@opentelemetry/api')

// Prefer the application's API version so its SDK and propagators remain in
// control. Edge bundles provide that dependency; Node retains the bundled
// fallback used by the Next tracer.
if (process.env.NEXT_RUNTIME === 'edge') {
  api = require('@opentelemetry/api') as typeof import('@opentelemetry/api')
} else {
  try {
    api = require('@opentelemetry/api') as typeof import('@opentelemetry/api')
  } catch {
    api =
      require('next/dist/compiled/@opentelemetry/api') as typeof import('next/dist/compiled/@opentelemetry/api') as unknown as typeof import('@opentelemetry/api')
  }
}

// Shared internal backend for request tracing and deferred coarse tooling.
// Resolve lazily: wrapping an operation before registration must not fix its
// provider to the no-op implementation.
export function getTracerInstance(): Tracer {
  return api.trace.getTracer('next.js', process.env.__NEXT_VERSION)
}

export { api }
