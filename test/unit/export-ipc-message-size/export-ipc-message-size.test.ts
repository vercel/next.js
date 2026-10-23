/* eslint-env jest */
import {
  assertExportPagesInputFitsInIpcMessage,
  assertExportResultsFitInIpcMessage,
  ExportIpcMessageTooLargeError,
  getExportPagesInputMessageLength,
  getExportResultsMessageLength,
  shouldCheckExportResultsMessageSize,
} from 'next/dist/export/ipc-message-size'

// The exact strings Node's JSON IPC channel and Next's worker-thread argument
// sanitizer build for these messages.
const resultsMessage = (results: unknown[]) =>
  JSON.stringify([0, results]) + '\n'
const childProcessCallMessage = (input: unknown) =>
  JSON.stringify([1, false, 'exportPages', [input]]) + '\n'
const workerThreadArgs = (input: unknown) => JSON.stringify([input])

const awkwardStrings = [
  'plain',
  'quote " and backslash \\',
  'newline \n tab \t control \u0001 \u001f',
  'non-ascii äöü ß 日本語',
  'emoji 🎉 and lone surrogate \ud800',
  '</script><!-- -->',
  '',
]

const sampleResults = () => [
  {
    page: '/p/[id]',
    path: '/p/0',
    pageKey: '/p/[id]: /p/0',
    result: {
      renderResumeDataCache: awkwardStrings.join('|'),
      htmlSize: 12,
      metadata: { segmentPaths: ['/a', '/b'], prefetchHints: undefined },
    },
  },
  {
    page: '/p/[id]',
    path: '/p/1',
    pageKey: '/p/[id]: /p/1',
    result: undefined,
  },
  ...awkwardStrings.map((s, i) => ({
    page: s,
    path: `/s/${i}`,
    pageKey: s,
    result: { error: true, duration: i },
  })),
]

const sampleInput = (seeds?: Record<string, string>) => ({
  buildId: 'build "id"',
  exportPaths: [{ page: '/[lang]/[slug]', path: '/en/[slug]' }],
  nextConfig: {
    // Functions are dropped by JSON serialization.
    generateBuildId: () => 'x',
    experimental: { cpus: 4, nested: { emoji: '🎉', fn: () => {} } },
  },
  renderOpts: { a: undefined, b: null, c: [1, 'two', undefined] },
  renderResumeDataCachesByPage: seeds,
})

const sampleSeeds = () =>
  Object.fromEntries(
    awkwardStrings.map((s, i) => [`/[lang]/[slug]: /${s}/${i}`, s.repeat(3)])
  )

const throwingToJSON = (error: Error) => ({
  toJSON() {
    throw error
  },
})

describe('getExportResultsMessageLength', () => {
  it.each([
    ['no results', []],
    ['one empty object', [{}]],
    ['awkward strings and undefined fields', sampleResults()],
    ['non-object entries', [undefined, null, 1, 'x', () => {}]],
  ])(
    'matches the length of the JSON IPC message (%s)',
    (_name, results: unknown[]) => {
      expect(getExportResultsMessageLength(results)).toBe(
        resultsMessage(results).length
      )
    }
  )
})

describe('assertExportResultsFitInIpcMessage', () => {
  it('allows a message that is exactly at the limit', () => {
    const results = sampleResults()
    const length = resultsMessage(results).length
    expect(() =>
      assertExportResultsFitInIpcMessage(results, results.length, length)
    ).not.toThrow()
  })

  it('rejects a message that is one character over the limit', () => {
    const results = sampleResults()
    const length = resultsMessage(results).length

    let error: unknown
    try {
      assertExportResultsFitInIpcMessage(results, 42, length - 1)
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(ExportIpcMessageTooLargeError)
    const { message } = error as Error
    expect(message).toContain('batch of 42 pages')
    expect(message).toContain('results')
    expect(message).toContain(`${length} characters`)
    expect(message).toContain(`maximum is ${length - 1}`)
    expect(message).toContain("'use cache'")
    expect(message).toContain('experimental.staticGenerationMinPagesPerWorker')
    expect(message).toContain('experimental.cpus')
  })

  it('translates a single entry that is too large to stringify on its own', () => {
    const results = [
      { page: '/a', path: '/a' },
      throwingToJSON(new RangeError('Invalid string length')),
    ]

    expect(() =>
      assertExportResultsFitInIpcMessage(results, 2, 1_000_000)
    ).toThrow(ExportIpcMessageTooLargeError)
    expect(() =>
      assertExportResultsFitInIpcMessage(results, 2, 1_000_000)
    ).toThrow('at least 1000000 characters')
  })

  it('rethrows a cyclic structure error unchanged', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(() => assertExportResultsFitInIpcMessage([cyclic], 1)).toThrow(
      TypeError
    )
    expect(() => assertExportResultsFitInIpcMessage([cyclic], 1)).not.toThrow(
      ExportIpcMessageTooLargeError
    )
  })

  it('rethrows unrelated errors unchanged', () => {
    const boom = new Error('boom')
    let error: unknown
    try {
      assertExportResultsFitInIpcMessage([throwingToJSON(boom)], 1)
    } catch (err) {
      error = err
    }
    expect(error).toBe(boom)

    const otherRangeError = new RangeError('Maximum call stack size exceeded')
    try {
      assertExportResultsFitInIpcMessage([throwingToJSON(otherRangeError)], 1)
    } catch (err) {
      error = err
    }
    expect(error).toBe(otherRangeError)
  })
})

describe('getExportPagesInputMessageLength', () => {
  it.each([
    ['without a seed map', undefined],
    ['with an empty seed map', {}],
    ['with seeds that need escaping', sampleSeeds()],
  ])('matches the child-process call message length (%s)', (_name, seeds) => {
    const input = sampleInput(seeds)
    expect(getExportPagesInputMessageLength(input, 'child-process')).toBe(
      childProcessCallMessage(input).length
    )
  })

  it.each([
    ['without a seed map', undefined],
    ['with seeds that need escaping', sampleSeeds()],
  ])(
    'matches the worker-thread sanitized arguments length (%s)',
    (_name, seeds) => {
      const input = sampleInput(seeds)
      expect(getExportPagesInputMessageLength(input, 'worker-thread')).toBe(
        workerThreadArgs(input).length
      )
    }
  )
})

describe('assertExportPagesInputFitsInIpcMessage', () => {
  it.each(['child-process', 'worker-thread'] as const)(
    'allows a message exactly at the limit and rejects one over it (%s)',
    (transport) => {
      const input = sampleInput(sampleSeeds())
      const length =
        transport === 'child-process'
          ? childProcessCallMessage(input).length
          : workerThreadArgs(input).length

      expect(() =>
        assertExportPagesInputFitsInIpcMessage(input, 3, transport, length)
      ).not.toThrow()

      let error: unknown
      try {
        assertExportPagesInputFitsInIpcMessage(input, 3, transport, length - 1)
      } catch (err) {
        error = err
      }
      expect(error).toBeInstanceOf(ExportIpcMessageTooLargeError)
      const { message } = error as Error
      expect(message).toContain('batch of 3 pages')
      expect(message).toContain('resume data cache seeds')
      expect(message).toContain(`${length} characters`)
      expect(message).toContain(
        'experimental.staticGenerationMinPagesPerWorker'
      )
    }
  )

  it('rejects an oversized filtered batch with the seed-direction error', () => {
    const batch = [
      { page: '/[lang]/[slug]', path: '/en/[slug]' },
      { page: '/[lang]/[slug]', path: '/de/[slug]' },
    ]
    const input = {
      ...sampleInput(),
      exportPaths: batch,
      // The batch's seed map has already been filtered by the caller.
      renderResumeDataCachesByPage: {
        '/[lang]/[slug]: /en/[slug]': 'e'.repeat(500),
        '/[lang]/[slug]: /de/[slug]': 'd'.repeat(500),
      },
    }

    // Both seeds fit individually, but the batch is too large together.
    const oneSeedInput = {
      ...input,
      exportPaths: batch.slice(0, 1),
      renderResumeDataCachesByPage: {
        '/[lang]/[slug]: /en/[slug]': 'e'.repeat(500),
      },
    }
    expect(() =>
      assertExportPagesInputFitsInIpcMessage(
        oneSeedInput,
        1,
        'child-process',
        1000
      )
    ).not.toThrow()

    let error: unknown
    try {
      assertExportPagesInputFitsInIpcMessage(input, 2, 'child-process', 1000)
    } catch (err) {
      error = err
    }
    expect(error).toBeInstanceOf(ExportIpcMessageTooLargeError)
    expect((error as Error).message).toContain('resume data cache seeds')
    expect((error as Error).message).toContain('batch of 2 pages')
  })

  it('translates a seed that is too large to stringify on its own', () => {
    const input = sampleInput({
      '/a': throwingToJSON(
        new RangeError('Invalid string length')
      ) as unknown as string,
    })

    expect(() =>
      assertExportPagesInputFitsInIpcMessage(input, 1, 'child-process', 5000)
    ).toThrow('at least 5000 characters')
  })
})

describe('shouldCheckExportResultsMessageSize', () => {
  it('checks in a forked child process', () => {
    expect(
      shouldCheckExportResultsMessageSize({
        isMainThread: true,
        hasIpcChannel: true,
      })
    ).toBe(true)
  })

  it('skips in a worker thread (results are structured-cloned)', () => {
    expect(
      shouldCheckExportResultsMessageSize({
        isMainThread: false,
        hasIpcChannel: true,
      })
    ).toBe(false)
  })

  it('skips when there is no IPC channel', () => {
    expect(
      shouldCheckExportResultsMessageSize({
        isMainThread: true,
        hasIpcChannel: false,
      })
    ).toBe(false)
  })
})
