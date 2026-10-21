import { execFile } from 'child_process'
import { createServer } from 'http'
import { promisify } from 'util'
import type { TraceSpanInfo } from 'next/dist/build/swc/generated-native'
import { queryTraceCli } from 'next/dist/cli/internal/query-trace'
import {
  renderMemorySummary,
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
  const execFileAsync = promisify(execFile)
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const rpc = JSON.parse(Buffer.concat(chunks).toString())
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end(
      `data: ${JSON.stringify({
        result: {
          content: [
            { type: 'text', text: JSON.stringify(rpc.params.arguments) },
          ],
        },
      })}\n`
    )
  })
  let port: number
  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No TCP port')
    port = address.port
  })
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })
  function runCommand(value: string) {
    return execFileAsync(
      process.execPath,
      [
        require.resolve('next/dist/bin/next'),
        'internal',
        'query-trace',
        '--port',
        String(port),
        '--json',
        '--samples',
        value,
      ],
      { timeout: 15000 }
    )
  }
  afterEach(() => {
    jest.restoreAllMocks()
    global.fetch = originalFetch
  })

  it.each(['0', '1', '300', String(Number.MAX_SAFE_INTEGER)])(
    'accepts count %s',
    async (value) => {
      const { stdout } = await runCommand(value)
      expect(JSON.parse(stdout)).toMatchObject({
        outputType: 'json',
        samples: Number(value),
      })
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
  ])('rejects count %s', async (value) => {
    await expect(runCommand(value)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('nonnegative safe integer'),
    })
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

  it('flattens the only native sample-series fields recursively', () => {
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

  it('prints independent memory and pressure summaries without worker bounds', () => {
    const summary = renderMemorySummary(
      span().memorySummary,
      (value) => `${value / 1024} KB`
    )
    expect(summary).toBe(
      'samples=1, peak=1 KB, min=1 KB, start=1 KB, end=1 KB, Δ=+0 KB, maxPressure=7'
    )
    expect(summary).not.toContain('activeWorkerThreads')
  })

  it('omits the memory summary when no readings are available', () => {
    expect(renderMemorySummary(undefined, String)).toBeNull()
  })

  it('prints readable units and explains independent sample grids', () => {
    const md = renderSampleSeriesMarkdown(
      series,
      (value) => `${value / 1024} KB`
    )
    expect(md).toBe(
      '\nSample indices are not shared timestamps.\n' +
        'Memory (TurboMalloc live bytes) samples: 1 KB 2 KB\n' +
        'Memory pressure samples: 7% 80%\n' +
        'Active Tokio workers samples: 2 1\n' +
        'Concurrency samples: 1.25 0.00\n'
    )
    expect(md).not.toContain('|')
  })

  it('prints none for empty metrics when another metric has values', () => {
    expect(
      renderSampleSeriesMarkdown(
        { ...emptySeries, concurrencySamples: [2.75] },
        String
      )
    ).toBe(
      '\nSample indices are not shared timestamps.\n' +
        'Memory (TurboMalloc live bytes) samples: none\n' +
        'Memory pressure samples: none\n' +
        'Active Tokio workers samples: none\n' +
        'Concurrency samples: 2.75\n'
    )
  })

  it('prints every returned value without an extra presentation cap', () => {
    const values = Array.from({ length: 300 }, (_, index) => index)
    expect(
      renderSampleSeriesMarkdown(
        { ...emptySeries, activeWorkerThreadsSamples: values },
        String
      )
    ).toContain(`Active Tokio workers samples: ${values.join(' ')}\n`)
  })

  it('does not print sample lines for omitted or zero details', () => {
    expect(renderSampleSeriesMarkdown(undefined, String)).toBe('')
    expect(renderSampleSeriesMarkdown(emptySeries, String)).toBe('')
  })
})
