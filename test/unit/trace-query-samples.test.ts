import type { TraceSpanInfo } from 'next/dist/build/swc/generated-native'
import {
  parseTraceSampleCount,
  queryTraceCli,
} from 'next/dist/cli/internal/query-trace'
import {
  renderSampleSeriesMarkdown,
  serializeTraceSpan,
} from 'next/dist/cli/internal/trace-query-result'

const series = {
  memorySamples: [1024, 2048],
  memoryPressureSamples: [7, 80],
  activeWorkerThreadsSamples: [2, 1],
  concurrencySamples: [1.25, 0],
}

function span(overrides: Partial<TraceSpanInfo> = {}): TraceSpanInfo {
  return {
    id: '1',
    name: 'work',
    cpuDuration: 100,
    correctedDuration: 100,
    startRelativeToParent: 0,
    endRelativeToParent: 100,
    args: [],
    isAggregated: false,
    allocations: 0,
    deallocations: 0,
    persistentAllocations: 0,
    allocationCount: 0,
    selfAllocations: 0,
    selfDeallocations: 0,
    selfPersistentAllocations: 0,
    selfAllocationCount: 0,
    memorySamples: [[0, 1024, 7, 2]],
    memorySummary: {
      count: 1,
      start: 1024,
      end: 1024,
      min: 1024,
      peak: 1024,
      maxPressure: 7,
    },
    children: [],
    ...overrides,
  }
}

const emptySeries = {
  memorySamples: [],
  memoryPressureSamples: [],
  activeWorkerThreadsSamples: [],
  concurrencySamples: [],
}

const options = {
  port: 1234,
  parent: undefined,
  aggregated: undefined,
  sort: undefined,
  search: undefined,
  maxDepth: undefined,
  depth: undefined,
  page: undefined,
  pageSize: undefined,
  json: true,
}

describe('query-trace samples', () => {
  const originalFetch = global.fetch
  afterEach(() => {
    jest.restoreAllMocks()
    global.fetch = originalFetch
  })

  it.each(['0', '1', '300', String(Number.MAX_SAFE_INTEGER)])(
    'accepts count %s',
    (value) => {
      expect(parseTraceSampleCount(value)).toBe(Number(value))
    }
  )

  it.each([
    '-1',
    '1.5',
    'NaN',
    'Infinity',
    '',
    '2x',
    '1e2',
    ' 2 ',
    '9007199254740992',
  ])('rejects count %s', (value) => {
    expect(() => parseTraceSampleCount(value)).toThrow(
      'nonnegative safe integer'
    )
  })

  it.each([undefined, 0, 1, 300])(
    'forwards explicit samples %s without a default',
    async (samples) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          'data: {"result":{"content":[{"type":"text","text":"{}"}]}}\n',
      })
      jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
      await queryTraceCli({ ...options, samples })
      const request = JSON.parse(
        jest.mocked(global.fetch).mock.calls[0][1]!.body as string
      )
      expect(request.params.arguments.outputType).toBe('json')
      if (samples === undefined) {
        expect(request.params.arguments).not.toHaveProperty('samples')
      } else {
        expect(request.params.arguments.samples).toBe(samples)
      }
    }
  )

  it('omits all sample fields by default, including descendants, without dropping summaries', () => {
    const result = serializeTraceSpan(span({ children: [span({ id: '1-2' })] }))
    for (const entry of [result, result.children[0]]) {
      for (const key of Object.keys(series))
        expect(entry).not.toHaveProperty(key)
      expect(entry).not.toHaveProperty('sampleSeries')
      expect(entry.memorySummary?.peak).toBe(1024)
      expect(entry.cpuDuration).toBe(100)
    }
  })

  it('flattens requested value arrays recursively rather than exposing legacy tuples', () => {
    const result = serializeTraceSpan(
      span({
        sampleSeries: series,
        isAggregated: true,
        count: 2,
        firstSpanId: '1',
        children: [span({ id: '1-2', sampleSeries: series })],
      })
    )
    for (const entry of [result, result.children[0]]) {
      for (const [key, values] of Object.entries(series))
        expect(entry).toHaveProperty(key, values)
      expect(entry).not.toHaveProperty('sampleSeries')
      expect(entry.memorySummary?.count).toBe(1)
    }
    expect(result.count).toBe(2)
    expect(result.firstSpanId).toBe('1')
  })

  it('returns four empty arrays for zero while keeping the memory summary', () => {
    expect(
      serializeTraceSpan(span({ sampleSeries: emptySeries }))
    ).toMatchObject({
      ...emptySeries,
      memorySummary: { peak: 1024 },
    })
  })

  it('prints readable units and explains independent sample grids', () => {
    const md = renderSampleSeriesMarkdown(
      series,
      (value) => `${value / 1024} KB`
    )
    expect(md).toContain('| 1 | 1 KB |')
    expect(md).toContain('| 2 | 80% |')
    expect(md).toContain('| 1 | 2 |')
    expect(md).toContain('| 1 | 1.25 |')
    expect(md).toContain('| 2 | 0.00 |')
    expect(md).toContain('Indices are not shared timestamps')
    expect(md).toContain('Active Tokio workers')
  })

  it('does not print sample tables for omitted or zero details', () => {
    expect(renderSampleSeriesMarkdown(undefined, String)).toBe('')
    expect(renderSampleSeriesMarkdown(emptySeries, String)).toBe('')
  })
})
