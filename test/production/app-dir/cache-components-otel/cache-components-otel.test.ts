import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

import type { SavedSpan } from '../../../e2e/opentelemetry/instrumentation/constants'
import {
  type Collector,
  connectCollector,
} from '../../../e2e/opentelemetry/instrumentation/collector'

const COLLECTOR_PORT = 9002

describe('cache-components otel', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    dependencies: require('./package.json').dependencies,
    env: {
      TEST_OTEL_COLLECTOR_PORT: String(COLLECTOR_PORT),
      NEXT_TELEMETRY_DISABLED: '1',
    },
    startServerTimeout: 15_000,
  })

  if (skipped) {
    return
  }

  let collector: Collector

  beforeEach(async () => {
    collector = await connectCollector({ port: COLLECTOR_PORT })
  })

  afterEach(async () => {
    await collector?.shutdown()
  })

  it('should emit cache-component prerender warmup spans', async () => {
    const seededValue = await getCachedValue()

    const revalidateResponse = await next.fetch('/api/revalidate', {
      method: 'POST',
    })
    expect(revalidateResponse.status).toBe(200)

    const staleValue = await getCachedValue()
    expect(staleValue).toBe(seededValue)

    await retry(async () => {
      expect(await getCachedValue()).not.toBe(seededValue)
    })

    await retry(async () => {
      const trace = findTraceContainingSpans(collector.getSpans(), [
        'GET /',
        'prerender route (app) /',
        'NextNodeServer.serverPrerenderWarmup',
        'NextNodeServer.clientPrerenderWarmup',
      ])

      expect(trace).toBeDefined()

      expect(
        findSpan(trace!, 'NextNodeServer.serverPrerenderWarmup')?.attributes?.[
          'next.prerenderWarmupContext'
        ]
      ).toBe('response')
      expect(
        findSpan(trace!, 'NextNodeServer.clientPrerenderWarmup')?.attributes?.[
          'next.prerenderWarmupContext'
        ]
      ).toBe('response')

      expectWarmupModuleLoadingMetrics(
        findSpan(trace!, 'NextNodeServer.serverPrerenderWarmup')
      )
      expectWarmupModuleLoadingMetrics(
        findSpan(trace!, 'NextNodeServer.clientPrerenderWarmup')
      )
    })
  })

  async function getCachedValue() {
    const $ = await next.render$('/')
    return $('#cached-value').text()
  }
})

function findTraceContainingSpans(
  spans: SavedSpan[],
  requiredNames: string[]
): SavedSpan[] | undefined {
  const traces = new Map<string, SavedSpan[]>()

  for (const span of spans) {
    if (!span.traceId) continue
    const trace = traces.get(span.traceId)
    if (trace) {
      trace.push(span)
    } else {
      traces.set(span.traceId, [span])
    }
  }

  for (const trace of traces.values()) {
    const names = new Set(trace.map((span) => span.name))
    if (requiredNames.every((name) => names.has(name))) {
      return trace
    }
  }
}

function findSpan(trace: SavedSpan[], name: string) {
  return trace.find((span) => span.name === name)
}

function expectWarmupModuleLoadingMetrics(span: SavedSpan | undefined) {
  expect(span).toBeDefined()
  expect(span?.attributes?.['next.clientComponentAsyncRequireCount']).toEqual(
    expect.any(Number)
  )
  expect(span?.attributes?.['next.clientComponentChunkLoadCount']).toEqual(
    expect.any(Number)
  )
  expect(span?.attributes?.['next.clientComponentDynamicImportCount']).toEqual(
    expect.any(Number)
  )
}
