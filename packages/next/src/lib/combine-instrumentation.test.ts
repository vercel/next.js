import { combineInstrumentation } from './combine-instrumentation'

const request = { path: '/', method: 'GET', headers: {} }
const context = {
  routerKind: 'App Router',
  routePath: '/',
  routeType: 'render',
  revalidateReason: undefined,
} as const

describe('combineInstrumentation', () => {
  it('runs every register in array order', async () => {
    const calls: string[] = []
    const combined = combineInstrumentation([
      { register: async () => void calls.push('a') },
      { register: () => void calls.push('b') },
    ])
    await combined.register()
    expect(calls).toEqual(['a', 'b'])
  })

  it('keeps running after a register throws, then rethrows that error', async () => {
    const calls: string[] = []
    const failure = new Error('a failed')
    const combined = combineInstrumentation([
      {
        register: () => {
          throw failure
        },
      },
      { register: () => void calls.push('b') },
    ])
    await expect(combined.register()).rejects.toBe(failure)
    expect(calls).toEqual(['b'])
  })

  it('throws an AggregateError when several hooks fail', async () => {
    const combined = combineInstrumentation([
      {
        register: () => {
          throw new Error('a')
        },
      },
      {
        register: async () => {
          throw new Error('b')
        },
      },
    ])
    const err: AggregateError = await combined.register().catch((e) => e)
    expect(err).toBeInstanceOf(AggregateError)
    expect(err.errors.map((e: Error) => e.message)).toEqual(['a', 'b'])
  })

  it('passes onRequestError arguments to every module', async () => {
    const seen: unknown[][] = []
    const error = new Error('request failed')
    const combined = combineInstrumentation([
      {
        onRequestError: () => {
          throw new Error('reporter down')
        },
      },
      { onRequestError: (...args: unknown[]) => void seen.push(args) },
    ])
    await expect(
      combined.onRequestError(error, request, context)
    ).rejects.toThrow('reporter down')
    expect(seen).toEqual([[error, request, context]])
  })

  it('awaits modules that require() returns as promises', async () => {
    const calls: string[] = []
    const combined = combineInstrumentation([
      Promise.resolve({ register: () => void calls.push('async module') }),
      { register: () => void calls.push('sync module') },
    ])
    await combined.register()
    expect(calls).toEqual(['async module', 'sync module'])
  })

  it('collects a module that fails to load and runs the rest', async () => {
    const calls: string[] = []
    const failure = new Error('load failed')
    const combined = combineInstrumentation([
      Promise.reject(failure),
      { register: () => void calls.push('b') },
    ])
    await expect(combined.register()).rejects.toBe(failure)
    expect(calls).toEqual(['b'])
  })

  it('does not leave a later module rejection unhandled while an earlier hook awaits', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => void unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const failure = new Error('load failed')
      let rejectLater!: (err: unknown) => void
      const later = new Promise((_, reject) => (rejectLater = reject))
      const combined = combineInstrumentation([
        {
          register: async () => {
            rejectLater(failure)
            // Let Node detect unhandled rejections while this hook waits.
            await new Promise((resolve) => setTimeout(resolve, 10))
          },
        },
        later,
      ])
      await expect(combined.register()).rejects.toBe(failure)
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('skips missing hooks and reads hooks from a default export', async () => {
    const calls: string[] = []
    const combined = combineInstrumentation([
      {},
      { default: { register: () => void calls.push('default') } },
      undefined,
    ])
    await combined.register()
    await combined.onRequestError(new Error('x'), request, context)
    expect(calls).toEqual(['default'])
  })
})
