import api, { Span } from '@opentelemetry/api'

export const tracer = api.trace.getTracer('next', process.env.__NEXT_VERSION)

export function traceFn<T extends (...args: unknown[]) => ReturnType<T>>(
  span: Span,
  fn: T
): ReturnType<T> {
  return tracer.withSpan(span, () => {
    try {
      return fn()
    } finally {
      span.end()
    }
  })
}

export function traceAsyncFn<T extends (...args: unknown[]) => ReturnType<T>>(
  span: Span,
  fn: T
): Promise<ReturnType<T>> {
  return tracer.withSpan(span, async () => {
    try {
      return await fn()
    } finally {
      span.end()
    }
  })
}
