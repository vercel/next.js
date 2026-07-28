/**
 * @jest-environment node
 */

import { runInNewContext } from 'node:vm'
import { setFlagsFromString } from 'node:v8'
import { SpanStatusCode, trace } from 'next/dist/compiled/@opentelemetry/api'
import { createLocalSpan, traceLocalSpan } from './local-span-recorder'
import { runWithRequestInsightsIdentity } from './request-insights-identity'
import { setSpanRecorderForTest, type SpanStoreRecord } from './span-store'
import {
  workAsyncStorage,
  type WorkStore,
} from '../../app-render/work-async-storage.external'

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

  it('ends traced local spans and records thrown errors', async () => {
    const error = new TypeError('boom')

    await expect(
      traceLocalSpan({ name: 'test.local-span.trace-error' }, async () => {
        throw error
      })
    ).rejects.toBe(error)

    expect(spanRecords).toEqual([
      expect.objectContaining({
        name: 'test.local-span.trace-error',
        status: 'error',
        error: {
          type: 'TypeError',
          message: 'boom',
        },
      }),
    ])
  })

  it('can start a detached trace inside an active local span', async () => {
    await traceLocalSpan({ name: 'foreground' }, async () => {
      await traceLocalSpan(
        { name: 'detached root', parentSpan: null },
        async () => {
          await traceLocalSpan({ name: 'detached child' }, async () => {})
        }
      )
    })

    const foreground = spanRecords.find((span) => span.name === 'foreground')!
    const detachedRoot = spanRecords.find(
      (span) => span.name === 'detached root'
    )!
    const detachedChild = spanRecords.find(
      (span) => span.name === 'detached child'
    )!

    expect(detachedRoot).toEqual(
      expect.objectContaining({
        parentSpanId: undefined,
      })
    )
    expect(detachedRoot.traceId).not.toBe(foreground.traceId)
    expect(detachedChild).toEqual(
      expect.objectContaining({
        traceId: detachedRoot.traceId,
        parentSpanId: detachedRoot.spanId,
      })
    )
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

  it('uses a nested Instant Insights identity instead of the work store identity', () => {
    const workStore = {
      requestId: 'work-request',
      htmlRequestId: 'work-html',
      route: '/dashboard',
    } as WorkStore

    workAsyncStorage.run(workStore, () => {
      runWithRequestInsightsIdentity(
        {
          requestId: 'originating-request',
          kind: 'instant-insights',
          htmlRequestId: 'originating-html',
          url: '/dashboard',
        },
        () => {
          const span = createLocalSpan({ name: 'Instant Insights' })
          span.end()
        }
      )
    })

    expect(spanRecords).toEqual([
      expect.objectContaining({
        requestId: 'originating-request',
        requestInsightKind: 'instant-insights',
        htmlRequestId: 'originating-html',
        route: '/dashboard',
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

  it('preserves explicit event and exception timestamps', () => {
    const epochTimestamp = performance.timeOrigin + 10
    const preProcessEpochTimestamp = performance.timeOrigin - 1
    const span = createLocalSpan({ name: 'test.local-span.explicit-events' })
    span.addEvent('numeric performance time', 1)
    span.addEvent('attributes and performance time', { phase: 'render' }, 2)
    span.addEvent('Date time', new Date(4))
    span.addEvent('HrTime', [0, 5_000_000])
    span.addEvent('numeric epoch time', epochTimestamp)
    span.addEvent(
      'numeric epoch before process start',
      preProcessEpochTimestamp
    )
    span.addEvent('third argument takes precedence', 6, 7)
    span.recordException(new TypeError('boom'), 3)
    span.end()

    expect(spanRecords[0].events).toEqual([
      {
        name: 'numeric performance time',
        timestamp: performance.timeOrigin + 1,
      },
      {
        name: 'attributes and performance time',
        timestamp: performance.timeOrigin + 2,
        attributes: { phase: 'render' },
      },
      { name: 'Date time', timestamp: 4 },
      { name: 'HrTime', timestamp: 5 },
      { name: 'numeric epoch time', timestamp: epochTimestamp },
      {
        name: 'numeric epoch before process start',
        timestamp: preProcessEpochTimestamp,
      },
      {
        name: 'third argument takes precedence',
        timestamp: performance.timeOrigin + 7,
      },
      {
        name: 'exception',
        timestamp: performance.timeOrigin + 3,
        attributes: {
          'exception.type': 'TypeError',
          'exception.message': 'boom',
        },
      },
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
