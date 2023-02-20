// import api, {
//   Context,
//   diag,
//   DiagConsoleLogger,
//   DiagLogLevel,
//   Span,
//   SpanOptions,
//   Tracer,
// } from 'next/dist/compiled/@opentelemetry/api'
import { SpanNames } from './constants'

import type { Context, Span, SpanOptions, Tracer } from '@opentelemetry/api'

let api: typeof import('@opentelemetry/api')

try {
  api = require('@opentelemetry/api')
} catch (err) {
  api = require('next/dist/compiled/@opentelemetry/api')
}

interface NextTracer extends Tracer {
  startSpan(name: SpanNames, options?: SpanOptions, context?: Context): Span
  startActiveSpan<F extends (span: Span) => unknown>(
    name: SpanNames,
    fn: F
  ): ReturnType<F>
  startActiveSpan<F extends (span: Span) => unknown>(
    name: SpanNames,
    options: SpanOptions,
    fn: F
  ): ReturnType<F>
  startActiveSpan<F extends (span: Span) => unknown>(
    name: SpanNames,
    options: SpanOptions,
    context: Context,
    fn: F
  ): ReturnType<F>
}

export function getTracer(): NextTracer {
  return api.trace.getTracer('next.js')
}
