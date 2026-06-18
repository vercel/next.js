import { runInNewContext } from 'node:vm'
import { setFlagsFromString } from 'node:v8'
import {
  clearSpanStoreForTest,
  getSpanRecords,
  InMemorySpanStore,
  isLocalSpanStoreEnabled,
  isRequestInsightsEnabled,
  recordSpan,
} from './span-store'

const originalLocalSpans = process.env.NEXT_OTEL_LOCAL_SPANS
const originalRequestInsights = process.env.__NEXT_REQUEST_INSIGHTS
const originalDevServer = process.env.__NEXT_DEV_SERVER

setFlagsFromString('--expose-gc')
const forceGarbageCollection = runInNewContext('gc') as () => void

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

describe('span store', () => {
  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
  })

  afterEach(() => {
    restoreEnv('NEXT_OTEL_LOCAL_SPANS', originalLocalSpans)
    restoreEnv('__NEXT_REQUEST_INSIGHTS', originalRequestInsights)
    restoreEnv('__NEXT_DEV_SERVER', originalDevServer)
    clearSpanStoreForTest()
  })

  it('keeps bounded in-memory records with OTel-compatible identity fields and links', () => {
    const traceStore = new InMemorySpanStore({ maxRecords: 2 })

    traceStore.record({
      name: 'next.cache_component.produce',
      traceId: '00000000000000000000000000000001',
      spanId: '0000000000000001',
      route: '/products/[id]',
      attributes: {
        'next.phase': 'build',
        'next.artifact.kind': 'ppr-shell',
      },
    })

    traceStore.record({
      name: 'next.cache_component.consume',
      traceId: '00000000000000000000000000000002',
      spanId: '0000000000000002',
      requestId: 'req_1',
      route: '/products/[id]',
      attributes: {
        'next.phase': 'request',
        'next.cache.status': 'hit',
        'next.artifact.kind': 'ppr-shell',
      },
      events: [
        {
          name: 'next.cache.lookup',
          timestamp: 1,
          attributes: {
            'next.cache.status': 'hit',
          },
        },
      ],
      links: [
        {
          traceId: '00000000000000000000000000000001',
          spanId: '0000000000000001',
          attributes: {
            'next.link.reason': 'artifact.reuse',
          },
        },
      ],
    })

    traceStore.record({
      name: 'next.cache_component.consume',
      requestId: 'req_2',
      route: '/cart',
      attributes: {
        'next.cache.status': 'miss',
      },
    })

    expect(traceStore.getRecords()).toHaveLength(2)
    expect(traceStore.getRecords({ requestId: 'req_1' })).toEqual([
      expect.objectContaining({
        name: 'next.cache_component.consume',
        requestId: 'req_1',
        route: '/products/[id]',
        attributes: expect.objectContaining({
          'next.cache.status': 'hit',
        }),
        links: [
          {
            traceId: '00000000000000000000000000000001',
            spanId: '0000000000000001',
            attributes: {
              'next.link.reason': 'artifact.reuse',
            },
          },
        ],
        events: [
          {
            name: 'next.cache.lookup',
            timestamp: 1,
            attributes: {
              'next.cache.status': 'hit',
            },
          },
        ],
      }),
    ])
  })

  it('releases attribute payloads from evicted records', async () => {
    const { traceStore, attributeRef } = createStoreWithEvictedAttribute()

    expect(traceStore.getRecords()).toEqual([
      expect.objectContaining({ name: 'second' }),
    ])

    await expectCollected(attributeRef)
  })

  it('records to the global in-memory store only when local span capture is enabled', () => {
    delete process.env.NEXT_OTEL_LOCAL_SPANS

    recordSpan({
      name: 'next.cache_component.consume',
      requestId: 'req_1',
    })

    expect(getSpanRecords()).toEqual([])

    process.env.NEXT_OTEL_LOCAL_SPANS = '1'
    recordSpan({
      name: 'next.cache_component.consume',
      requestId: 'req_1',
      attributes: {
        'next.cache.status': 'hit',
      },
    })

    expect(getSpanRecords({ requestId: 'req_1' })).toEqual([
      expect.objectContaining({
        name: 'next.cache_component.consume',
        requestId: 'req_1',
        attributes: {
          'next.cache.status': 'hit',
        },
      }),
    ])
  })

  it('does not enable local span capture outside the dev server', () => {
    delete process.env.__NEXT_DEV_SERVER
    process.env.NEXT_OTEL_LOCAL_SPANS = '1'
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    expect(isLocalSpanStoreEnabled()).toBe(false)

    recordSpan({ name: 'test.production' })
    expect(getSpanRecords()).toEqual([])
  })

  it('shares local records across separate module instances in the same process', () => {
    process.env.NEXT_OTEL_LOCAL_SPANS = '1'

    jest.isolateModules(() => {
      const { recordSpan: recordSpanFromIsolatedModule } =
        require('./span-store') as typeof import('./span-store')

      recordSpanFromIsolatedModule({
        name: 'fetch GET https://example.vercel.sh/',
        spanId: '0000000000000001',
        traceId: '00000000000000000000000000000001',
        attributes: {
          'next.span_type': 'AppRender.fetch',
          'http.url': 'https://example.vercel.sh/',
        },
      })
    })

    expect(getSpanRecords()).toEqual([
      expect.objectContaining({
        name: 'fetch GET https://example.vercel.sh/',
        spanId: '0000000000000001',
        traceId: '00000000000000000000000000000001',
        attributes: expect.objectContaining({
          'next.span_type': 'AppRender.fetch',
          'http.url': 'https://example.vercel.sh/',
        }),
      }),
    ])
  })

  it('treats boolean define-env request insights values as enabled', () => {
    ;(process.env.__NEXT_REQUEST_INSIGHTS as unknown) = true

    expect(isRequestInsightsEnabled()).toBe(true)
  })
})

function createStoreWithEvictedAttribute() {
  const traceStore = new InMemorySpanStore({ maxRecords: 1 })
  const attributeValue = ['retained-value']
  const attributeRef = new WeakRef(attributeValue)

  traceStore.record({
    name: 'first',
    attributes: { 'next.test.payload': attributeValue },
  })
  traceStore.record({ name: 'second' })

  return { traceStore, attributeRef }
}

async function expectCollected(ref: WeakRef<object>): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    forceGarbageCollection()
    await new Promise<void>((resolve) => setImmediate(resolve))
  }

  expect(ref.deref()).toBeUndefined()
}
