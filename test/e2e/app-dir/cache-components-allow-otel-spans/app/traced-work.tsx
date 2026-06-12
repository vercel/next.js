import { type Span, type Tracer, trace, context } from '@opentelemetry/api'
import { Suspense } from 'react'

async function asyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return 42
}

async function cachedAsyncWork() {
  'use cache'
  return asyncWork()
}

function withSpan(fn) {
  return function () {
    const tracer = trace.getTracer('tracer-manual-span')
    const span = tracer.startSpan('span-manual-span')
    const ctx = trace.setSpan(context.active(), span)
    return context.with(ctx, fn)
  }
}

function withActiveSpan(fn) {
  return function () {
    const tracer = trace.getTracer('tracer-active-span')
    return tracer.startActiveSpan('span-active-span', fn)
  }
}

const asyncWorkWithManualSpan = withSpan(asyncWork)
const asyncWorkWithActiveSpan = withActiveSpan(asyncWork)
const cachedAsyncWorkWithManualSpan = withSpan(cachedAsyncWork)
const cachedAsyncWorkWithActiveSpan = withActiveSpan(cachedAsyncWork)

export function CachedInnerTraceManualSpan() {
  async function Inner() {
    const result = await cachedAsyncWorkWithManualSpan()
    return <p className="result">{result}</p>
  }
  return (
    <section id="t1">
      <h2>(Manual Span) Cached Async Work</h2>
      <Suspense fallback={<Loading />}>
        <Inner />
      </Suspense>
    </section>
  )
}

export function InnerTraceManualSpan() {
  async function Inner() {
    const result = await asyncWorkWithManualSpan()
    return <p className="result">{result}</p>
  }
  return (
    <section id="t2">
      <h2>(Manual Span) Async Work</h2>
      <Suspense fallback={<Loading />}>
        <Inner />
      </Suspense>
    </section>
  )
}

export const CachedTracedComponentManualSpan = withSpan(async function () {
  async function Inner() {
    const result = await cachedAsyncWork()
    return <Result>{result}</Result>
  }
  return (
    <section id="t3">
      <h2>(Manual Span) Inner Traced "use cache" Function</h2>
      <Suspense fallback={<Loading />}>
        <Inner />
      </Suspense>
    </section>
  )
})

export const TracedComponentManualSpan = withSpan(async function () {
  async function Inner() {
    const result = await asyncWork()
    return <Result>{result}</Result>
  }
  return (
    <section id="t4">
      <h2>(Manual Span) Inner Traced Function</h2>
      <Suspense fallback={<Loading />}>
        <Inner />
      </Suspense>
    </section>
  )
})

export function CachedInnerTraceActiveSpan() {
  async function Inner() {
    const result = await cachedAsyncWorkWithActiveSpan()
    return <Result>{result}</Result>
  }
  return (
    <section id="t5">
      <h2>(Active Span) Cached Async Work</h2>
      <Suspense fallback={<Loading />}>
        <Inner />
      </Suspense>
    </section>
  )
}

export function InnerTraceActiveSpan() {
  async function Inner() {
    const result = await asyncWorkWithActiveSpan()
    return <Result>{result}</Result>
  }
  return (
    <section id="t6">
      <h2>(Active Span) Async Work</h2>
      <Suspense fallback={<Loading />}>
        <Inner />
      </Suspense>
    </section>
  )
}

export const CachedTracedComponentActiveSpan = withActiveSpan(async function (
  span: Span
) {
  async function Inner() {
    const result = await cachedAsyncWork()
    return <Result>{result}</Result>
  }

  return (
    <section id="t7">
      <h2>(Active Span) Inner Traced "use cache" Function</h2>
      <div>
        <p>
          Span Representative{' '}
          <span className="span" suppressHydrationWarning>
            {parseInt(span.spanContext().spanId.slice(10), 16)}
          </span>
        </p>
        <Suspense fallback={<Loading />}>
          <Inner />
        </Suspense>
      </div>
    </section>
  )
})

export const TracedComponentActiveSpan = withActiveSpan(async function (
  span: Span
) {
  async function Inner() {
    const result = await asyncWork()
    return <Result>{result}</Result>
  }
  return (
    <section id="t8">
      <h2>(Active Span) Inner Traced Function</h2>
      <div>
        <p>
          Span Representative{' '}
          <span className="span" suppressHydrationWarning>
            {parseInt(span.spanContext().spanId.slice(10), 16)}
          </span>
        </p>
        <Suspense fallback={<Loading />}>
          <Inner />
        </Suspense>
      </div>
    </section>
  )
})

function Loading() {
  return <span className="fallback">loading...</span>
}

function Result({ children }: { children: React.ReactNode }) {
  return <p className="result">{children}</p>
}

function withEarlyTracerActiveSpan(fn) {
  return function () {
    // Acquired in instrumentation.node.ts before the provider was registered
    // (a ProxyTracer), like OTel instrumentation libraries do in their
    // constructors. Undefined during build prerendering, where instrumentation
    // is not loaded — fall back to a render-time tracer which is equally inert
    // there (no provider is registered either).
    const tracer =
      ((globalThis as any).__earlyTracer as Tracer | undefined) ??
      trace.getTracer('early-tracer')
    return tracer.startActiveSpan('span-early-active-span', fn)
  }
}

export const TracedComponentEarlyTracerActiveSpan = withEarlyTracerActiveSpan(
  async function (span: Span) {
    async function Inner() {
      const result = await asyncWork()
      return <Result>{result}</Result>
    }
    return (
      <section id="t9">
        <h2>(Active Span) Tracer acquired before provider registration</h2>
        <div>
          <p>
            Span Representative{' '}
            <span className="span" suppressHydrationWarning>
              {parseInt(span.spanContext().spanId.slice(10), 16)}
            </span>
          </p>
          <Suspense fallback={<Loading />}>
            <Inner />
          </Suspense>
        </div>
      </section>
    )
  }
)
