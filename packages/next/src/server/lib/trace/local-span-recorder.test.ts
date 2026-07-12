/**
 * @jest-environment node
 */

import { runInNewContext } from 'node:vm'
import { setFlagsFromString } from 'node:v8'
import { SpanStatusCode, trace } from 'next/dist/compiled/@opentelemetry/api'
import { createLocalSpan } from './local-span-recorder'
import { clearSpanStoreForTest, getSpanRecords } from './span-store'

const originalLocalSpans = process.env.NEXT_OTEL_LOCAL_SPANS
const originalDevServer = process.env.__NEXT_DEV_SERVER

setFlagsFromString('--expose-gc')
const forceGarbageCollection = runInNewContext('gc') as () => void

describe('local recording span', () => {
  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
  })

  afterEach(() => {
    if (originalLocalSpans === undefined) {
      delete process.env.NEXT_OTEL_LOCAL_SPANS
    } else {
      process.env.NEXT_OTEL_LOCAL_SPANS = originalLocalSpans
    }
    if (originalDevServer === undefined) {
      delete process.env.__NEXT_DEV_SERVER
    } else {
      process.env.__NEXT_DEV_SERVER = originalDevServer
    }
    clearSpanStoreForTest()
  })

  it('records a snapshot exactly once when the span ends', () => {
    process.env.NEXT_OTEL_LOCAL_SPANS = '1'
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
    expect(getSpanRecords()).toEqual([])

    span.end()
    span.setAttribute('next.after_end', true)
    span.end()

    expect(span.isRecording()).toBe(false)
    expect(getSpanRecords()).toEqual([
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
    process.env.NEXT_OTEL_LOCAL_SPANS = '1'
    const span = createLocalSpan({
      name: 'test.local-span.attributes',
      attributes: { 'next.phase': 'render' },
    })

    span.setAttributes({
      'next.phase': undefined,
      'next.route': '/dashboard',
    })
    span.end()

    expect(getSpanRecords()).toEqual([
      expect.objectContaining({
        attributes: {
          'next.phase': 'render',
          'next.route': '/dashboard',
        },
      }),
    ])
  })

  it('captures status, exception, and event mutations before ending', () => {
    process.env.NEXT_OTEL_LOCAL_SPANS = '1'
    const span = createLocalSpan({ name: 'test.local-span.error' })

    span.addEvent('test.event', { 'next.phase': 'render' })
    span.recordException(new TypeError('boom'))
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'failed' })
    span.end()

    expect(getSpanRecords()).toEqual([
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

  it('releases heavy references after ending while the span remains reachable', async () => {
    process.env.NEXT_OTEL_LOCAL_SPANS = '1'
    const { span, delegateRef, attributeRef } = createEndedSpanWithReferences()

    clearSpanStoreForTest()
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
