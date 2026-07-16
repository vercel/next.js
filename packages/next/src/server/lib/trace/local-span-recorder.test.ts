/**
 * @jest-environment node
 */

import { runInNewContext } from 'node:vm'
import { setFlagsFromString } from 'node:v8'
import { SpanStatusCode, trace } from 'next/dist/compiled/@opentelemetry/api'
import { createLocalSpan } from './local-span-recorder'
import { runWithRequestInsightsIdentity } from './request-insights-identity'
import { setSpanRecorderForTest, type SpanStoreRecord } from './span-store'

const originalDevServer = process.env.__NEXT_DEV_SERVER
const spanRecords: SpanStoreRecord[] = []

setFlagsFromString('--expose-gc')
const forceGarbageCollection = runInNewContext('gc') as () => void

describe('local recording span', () => {
  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
    setSpanRecorderForTest((span) => spanRecords.push(span))
  })

  afterEach(() => {
    if (originalDevServer === undefined) {
      delete process.env.__NEXT_DEV_SERVER
    } else {
      process.env.__NEXT_DEV_SERVER = originalDevServer
    }
    setSpanRecorderForTest(undefined)
    spanRecords.length = 0
  })

  it('records a snapshot exactly once when the span ends', () => {
    const span = createLocalSpan({
      name: 'test.local-span',
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      attributes: {
        'next.phase': 'render',
      },
    })

    span.setAttribute('next.route', '/dashboard')
    expect(span.isRecording()).toBe(true)
    expect(spanRecords).toEqual([])

    span.end()
    span.setAttribute('next.after_end', true)
    span.end()

    expect(span.isRecording()).toBe(false)
    expect(spanRecords).toEqual([
      expect.objectContaining({
        name: 'test.local-span',
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdef',
        route: '/dashboard',
        status: 'ok',
        attributes: {
          'next.phase': 'render',
          'next.route': '/dashboard',
        },
      }),
    ])
  })

  it('ignores undefined values when setting attributes', () => {
    const span = createLocalSpan({
      name: 'test.local-span.attributes',
      attributes: { 'next.phase': 'render' },
    })

    span.setAttributes({
      'next.phase': undefined,
      'next.route': '/dashboard',
    })
    span.end()

    expect(spanRecords).toEqual([
      expect.objectContaining({
        attributes: {
          'next.phase': 'render',
          'next.route': '/dashboard',
        },
      }),
    ])
  })

  it('captures status, exception, and event mutations before ending', () => {
    const span = createLocalSpan({ name: 'test.local-span.error' })

    span.addEvent('test.event', { 'next.phase': 'render' })
    span.recordException(new TypeError('boom'))
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'failed' })
    span.end()

    expect(spanRecords).toEqual([
      expect.objectContaining({
        name: 'test.local-span.error',
        status: 'error',
        error: {
          type: 'TypeError',
          message: 'boom',
        },
        events: [
          expect.objectContaining({
            name: 'test.event',
            attributes: { 'next.phase': 'render' },
          }),
          expect.objectContaining({
            name: 'exception',
            attributes: {
              'exception.type': 'TypeError',
              'exception.message': 'boom',
            },
          }),
        ],
      }),
    ])
  })

  it('uses the request insights identity before the work store exists', () => {
    runWithRequestInsightsIdentity(
      {
        requestId: 'request-1',
        htmlRequestId: 'html-1',
        url: '/dashboard?tab=overview',
      },
      () => {
        const span = createLocalSpan({ name: 'test.request-root' })
        span.end()
      }
    )

    expect(spanRecords).toEqual([
      expect.objectContaining({
        name: 'test.request-root',
        requestId: 'request-1',
        htmlRequestId: 'html-1',
        url: '/dashboard?tab=overview',
      }),
    ])
  })

  it('records explicit performance timestamps', () => {
    const startTime = performance.now() - 10
    const span = createLocalSpan({
      name: 'test.local-span.explicit-time',
      startTime,
    })

    span.end(startTime + 0.2)

    expect(spanRecords).toEqual([
      expect.objectContaining({
        name: 'test.local-span.explicit-time',
        startTime: performance.timeOrigin + startTime,
        durationMs: expect.closeTo(0.2, 3),
      }),
    ])
  })

  it('releases heavy references after ending while the span remains reachable', async () => {
    const { span, delegateRef, attributeRef } = createEndedSpanWithReferences()

    spanRecords.length = 0
    await expectCollected(delegateRef)
    await expectCollected(attributeRef)

    expect(span.spanContext()).toEqual({
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: 1,
    })
  })
})

function createEndedSpanWithReferences() {
  const delegate = trace.wrapSpanContext({
    traceId: '0123456789abcdef0123456789abcdef',
    spanId: '0123456789abcdef',
    traceFlags: 1,
  })
  const attributeValue = ['retained-value']
  const delegateRef = new WeakRef(delegate)
  const attributeRef = new WeakRef(attributeValue)
  const span = createLocalSpan({
    name: 'test.local-span.retention',
    delegateSpan: delegate,
    attributes: {
      'next.test.payload': attributeValue,
    },
  })

  span.end()
  return { span, delegateRef, attributeRef }
}

async function expectCollected(ref: WeakRef<object>): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    forceGarbageCollection()
    await new Promise<void>((resolve) => setImmediate(resolve))
  }

  expect(ref.deref()).toBeUndefined()
}
