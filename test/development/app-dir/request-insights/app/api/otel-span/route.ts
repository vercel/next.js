import { createRequestInsightsSpanProcessor } from 'next/experimental/request-insights'

const processor = createRequestInsightsSpanProcessor()
const processorFactoryKey = Symbol.for(
  '@next/request-insights-span-processor-factory'
)

export function GET() {
  const now = Date.now()
  const span = {
    name: 'redis GET',
    spanContext: () => ({
      traceId: '00000000000000000000000000000001',
      spanId: '0000000000000001',
    }),
    parentSpanContext: {
      traceId: '00000000000000000000000000000001',
      spanId: '0000000000000002',
    },
    startTime: [Math.floor(now / 1000), (now % 1000) * 1_000_000],
    duration: [0, 5_000_000],
    status: { code: 1 },
    attributes: {
      'db.system.name': 'redis',
      'db.operation.name': 'GET',
      'db.pool.idle': 3,
      query: 'GET account:123',
    },
    events: [
      {
        name: 'redis event',
        time: [Math.floor(now / 1000), (now % 1000) * 1_000_000],
        attributes: { 'db.event.detail': 'cache miss' },
      },
    ],
    links: [
      {
        context: {
          traceId: '00000000000000000000000000000001',
          spanId: '0000000000000003',
        },
        attributes: { 'db.link.role': 'replica' },
      },
    ],
  }

  processor.onStart(span, {})
  processor.onEnd(span)

  const nextSpan = {
    ...span,
    name: 'duplicate Next.js span',
    attributes: { 'next.span_type': 'AppRender.getBodyResult' },
  }
  processor.onStart(nextSpan, {})
  processor.onEnd(nextSpan)

  const globalStore = globalThis as typeof globalThis & {
    [key: symbol]: unknown
  }
  return Response.json({
    autoFactoryAvailable:
      typeof globalStore[processorFactoryKey] === 'function',
  })
}
