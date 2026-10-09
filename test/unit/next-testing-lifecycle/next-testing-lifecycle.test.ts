/* eslint-disable no-empty-pattern -- Fixture callbacks require explicit destructuring. */
import {
  createCollector,
  selectedCases,
} from 'next/dist/experimental/testing/runner/collector'
import { runCollected } from 'next/dist/experimental/testing/runner/lifecycle'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

// Semantic reference: Vitest checkout 0780a8e5b7967a4168173599e9c74fb79aab2483,
// packages/vitest/src/runtime/runner/{hooks,run,fixture}.ts. This corpus exercises
// Next's collector directly; it does not establish compiler/runtime integration.
const options = () => ({ runId: 'run', signal: new AbortController().signal })
const run = (collector: ReturnType<typeof createCollector>) =>
  runCollected(collector.close(), options(), () => {})

describe('Next-owned Vitest lifecycle', () => {
  it('finalizes and disposes suite hook scopes without emitting synthetic case events', async () => {
    const c = createCollector('file')
    const log: string[] = []
    c.api.beforeAll(() => () => {
      log.push('returned cleanup')
    })
    c.api.afterAll(() => {
      log.push('after all')
    })
    c.api.test('blocked', () => {
      throw new Error('must not run')
    })
    const starts: string[] = []
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        onCaseStart: (context) => {
          starts.push(context.testId)
        },
      },
      () => {},
      {
        setActiveHook(context) {
          log.push(context ? `active ${context.hook}` : 'inactive')
        },
        beginHook(context) {
          expect(context).not.toHaveProperty('testId')
          expect(context).not.toHaveProperty('retry')
          return {
            async finalize() {
              if (context.hook === 'beforeAll')
                throw new Error('hook assertions failed')
            },
            async dispose() {
              log.push(`disposed ${context.hook}`)
            },
          }
        },
      }
    )
    expect(result.cases).toHaveLength(1)
    expect(result.cases[0].errors[0].phase).toBe('beforeAll')
    expect(starts).toEqual([])
    expect(log).toEqual([
      'active beforeAll',
      'disposed beforeAll',
      'inactive',
      'active afterAll',
      'after all',
      'disposed afterAll',
      'inactive',
      'active cleanup',
      'returned cleanup',
      'disposed cleanup',
      'inactive',
    ])
  })

  it.each([false, true])(
    'retains beforeAll timeout failure (nested: %s)',
    async (nested) => {
      const c = createCollector('file')
      const declare = () => {
        c.api.beforeAll(() => new Promise(() => {}), 1)
        c.api.test('blocked', () => {
          throw new Error('must not run')
        })
      }
      if (nested) c.api.describe('nested', declare)
      else declare()
      const result = await run(c)
      expect(result.cases[0].status).toBe('failed')
      expect(result.cases[0].errors[0].phase).toBe('beforeAll')
      // Match B's file failure decision: the timed-out setup cannot be false green.
      expect(
        result.errors.length > 0 ||
          result.cases.some((test) => test.status === 'failed')
      ).toBe(true)
    }
  )

  it('honors trailing numeric timeout and rejects trailing unsupported arguments', async () => {
    const c = createCollector('file')
    c.api.test('timeout', () => new Promise(() => {}), 1)
    expect(() =>
      (c.api.test as any)('options', () => {}, { retry: 1 })
    ).toThrow('trailing test options')
    expect(() =>
      (c.api.test as any)(
        'callbacks',
        () => {},
        () => {}
      )
    ).toThrow('multiple callbacks')
    const result = await run(c)
    expect(result.cases[0].status).toBe('failed')
    expect(String(result.cases[0].errors[0].error)).toContain('after 1ms')
  })

  it('rejects injected fixture tuples while preserving static array values', async () => {
    const c = createCollector('file')
    const test = c.api.test.extend<{ value: unknown }>({
      value: [
        async ({}, provide: (value: unknown) => Promise<void>) => {
          await provide(42)
        },
        { injected: true },
      ] as any,
    })
    test('unsupported', ({ value }) => value)
    const arrayTest = c.api.test.extend<{ value: unknown[] }>({
      value: [42, { label: 'data' }],
    })
    arrayTest('array', ({ value }) =>
      expect(value).toEqual([42, { label: 'data' }])
    )
    const result = await run(c)
    expect(result.cases[0].status).toBe('failed')
    expect(String(result.cases[0].errors[0].error)).toContain(
      'fixture option "injected"'
    )
    expect(result.cases[1].status).toBe('passed')
  })

  it('selects focus without reviving skipped ancestors and preserves stable declaration IDs', () => {
    const c = createCollector('file')
    c.api.test('ordinary', () => {})
    c.api.describe.skip('skip', () => c.api.test.only('hidden focus', () => {}))
    c.api.describe.only('focus', () => {
      c.api.test('selected', () => {})
      c.api.test.todo('pending')
    })
    expect(
      [...selectedCases(c.close())].map(([test, mode]) => [test.id, mode])
    ).toEqual([
      ['file/0', 'skip'],
      ['file/1/0', 'skip'],
      ['file/2/0', 'run'],
      ['file/2/1', 'todo'],
    ])
    expect(() => c.api.test('late', () => {})).toThrow('closed')
  })

  it('retains structural reporting names and distinguishes skipped from todo cases', async () => {
    const c = createCollector('file')
    c.api.describe('outer > literal', () => {
      c.api.describe('inner', () => {
        c.api.test('leaf > literal', () => {})
        c.api.test.skip('skipped', () => {})
        c.api.test.todo('pending')
      })
    })
    const starts: unknown[] = []
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        onCaseStart: ({ name, testName, ancestors, mode }) => {
          starts.push({ name, testName, ancestors, mode })
        },
      },
      () => {}
    )
    const ancestors = [
      { id: 'file/0', name: 'outer > literal' },
      { id: 'file/0/0', name: 'inner' },
    ]
    expect(starts).toEqual([
      {
        name: 'outer > literal > inner > leaf > literal',
        testName: 'leaf > literal',
        ancestors,
        mode: 'run',
      },
    ])
    expect(
      result.cases.map(({ name, testName, ancestors, mode, status }) => ({
        name,
        testName,
        ancestors,
        mode,
        status,
      }))
    ).toEqual([
      {
        name: 'outer > literal > inner > leaf > literal',
        testName: 'leaf > literal',
        ancestors,
        mode: 'run',
        status: 'passed',
      },
      {
        name: 'outer > literal > inner > skipped',
        testName: 'skipped',
        ancestors,
        mode: 'skip',
        status: 'skipped',
      },
      {
        name: 'outer > literal > inner > pending',
        testName: 'pending',
        ancestors,
        mode: 'todo',
        status: 'skipped',
      },
    ])
  })

  it('runs nested hooks and returned cleanups in stack order', async () => {
    const c = createCollector('file')
    const log: string[] = []
    c.api.beforeAll(() => {
      log.push('all')
      return () => {
        log.push('all cleanup')
      }
    })
    c.api.beforeEach(() => {
      log.push('outer before')
      return () => {
        log.push('outer cleanup')
      }
    })
    c.api.afterEach(() => {
      log.push('outer after')
    })
    c.api.describe('inner', () => {
      c.api.beforeEach(() => {
        log.push('inner before')
        return () => {
          log.push('inner cleanup')
        }
      })
      c.api.afterEach(() => {
        log.push('inner after 1')
      })
      c.api.afterEach(() => {
        log.push('inner after 2')
      })
      c.api.test('body', ({ onTestFinished }) => {
        log.push('body')
        onTestFinished(() => {
          log.push('finished')
        })
      })
    })
    const result = await run(c)
    expect(result.cases[0].status).toBe('passed')
    expect(log).toEqual([
      'all',
      'outer before',
      'inner before',
      'body',
      'inner after 2',
      'inner after 1',
      'outer after',
      'inner cleanup',
      'outer cleanup',
      'finished',
      'all cleanup',
    ])
  })

  it('retries setup/body with fresh identity and preserves failed attempts', async () => {
    const c = createCollector('file')
    let tries = 0
    let cleanups = 0
    c.api.beforeEach(() => {
      tries++
      return () => {
        cleanups++
      }
    })
    c.api.test('retry', { retry: 1 }, () => {
      if (tries === 1) throw new Error('first')
    })
    const result = await run(c)
    expect(result.cases.map((t) => [t.status, t.attempt.retry])).toEqual([
      ['failed', 0],
      ['passed', 1],
    ])
    expect(new Set(result.cases.map((t) => t.attempt.id)).size).toBe(2)
    expect(cleanups).toBe(2)
  })

  it('retains setup and teardown failures and still runs all cleanup', async () => {
    const c = createCollector('file')
    const log: string[] = []
    c.api.beforeEach(() => {
      log.push('setup')
      return () => {
        log.push('cleanup')
        throw new Error('cleanup')
      }
    })
    c.api.beforeEach(() => {
      throw new Error('setup')
    })
    c.api.afterEach(() => {
      log.push('after 1')
    })
    c.api.afterEach(() => {
      throw new Error('after')
    })
    c.api.test('never body', () => {
      throw new Error('body must not run')
    })
    const result = await run(c)
    expect(result.cases[0].errors.map((e) => e.phase)).toEqual([
      'beforeEach',
      'afterEach',
      'cleanup',
    ])
    expect(log).toEqual(['setup', 'after 1', 'cleanup'])
  })

  it('attributes beforeAll failure to descendants and afterAll failure to file', async () => {
    const c = createCollector('file')
    c.api.beforeAll(() => {
      throw new Error('before all')
    })
    c.api.afterAll(() => {
      throw new Error('after all')
    })
    c.api.describe('nested', () => c.api.test('blocked', () => {}))
    const result = await run(c)
    expect(result.cases[0].status).toBe('failed')
    expect(result.cases[0].errors[0].phase).toBe('beforeAll')
    expect(result.errors[0].phase).toBe('afterAll')
  })

  it('poisons a timed-out realm and rejects late cleanup registration', async () => {
    const c = createCollector('file')
    let register: ((fn: () => void) => void) | undefined
    c.api.test('timeout', { timeout: 1, retry: 1 }, ({ onTestFinished }) => {
      register = onTestFinished
      return new Promise(() => {})
    })
    c.api.test('next', () => {
      throw new Error('must not run')
    })
    const result = await run(c)
    expect(result.cases.map((t) => t.status)).toEqual(['failed', 'cancelled'])
    expect(() => register!(() => {})).toThrow('finished')
  })

  it('resolves lazy fixture dependencies and cleans test scope before file scope', async () => {
    const c = createCollector('file')
    const log: string[] = []
    const test = c.api.test.extend<{
      file: string
      value: string
      unused: string
    }>({
      file: [
        async ({}, provide) => {
          log.push('file setup')
          await provide('file')
          log.push('file cleanup')
        },
        { scope: 'file' },
      ],
      value: async ({ file }, provide) => {
        log.push('test setup')
        await provide(file + ' value')
        log.push('test cleanup')
      },
      unused: async ({}, provide) => {
        await provide('unused')
        throw new Error('unused fixture must not run')
      },
    })
    test('one', ({ value }) => expect(value).toBe('file value'))
    test('two', ({ value }) => expect(value).toBe('file value'))
    const result = await run(c)
    expect(result.cases.map((t) => t.status)).toEqual(['passed', 'passed'])
    expect(log).toEqual([
      'file setup',
      'test setup',
      'test cleanup',
      'test setup',
      'test cleanup',
      'file cleanup',
    ])
  })

  it('rejects unsupported APIs and fixture scope dependencies explicitly', async () => {
    const c = createCollector('file')
    expect(() => (c.api.test as any).concurrent).toThrow(
      'does not support test.concurrent'
    )
    expect(() => c.api.test('bad', { repeats: 2 } as any, () => {})).toThrow(
      'repeats'
    )
    const test = c.api.test.extend<{ testValue: string; fileValue: string }>({
      testValue: 'value',
      fileValue: [
        async ({ testValue }, provide) => {
          await provide(testValue)
        },
        { scope: 'file' },
      ],
    })
    test('bad scope', ({ fileValue }) => fileValue)
    const result = await run(c)
    expect(String(result.cases[0].errors[0].error)).toContain(
      'File fixture cannot depend on test fixture'
    )
  })

  it('reports missing use and dependency cycles without hanging', async () => {
    const c = createCollector('file')
    const missing = c.api.test.extend<{ value: string }>({
      value: async ({}) => {},
    })
    missing('missing use', ({ value }) => value)
    const cyclic = c.api.test.extend<{ a: string; b: string }>({
      a: async ({ b }, provide) => {
        await provide(b)
      },
      b: async ({ a }, provide) => {
        await provide(a)
      },
    })
    cyclic('cycle', ({ a }) => a)
    const result = await run(c)
    expect(result.cases.map((t) => String(t.errors[0].error))).toEqual([
      'Error: Fixture "value" did not call use().',
      'Error: Circular fixture dependency: a -> b -> a',
    ])
  })

  it('recreates automatic test fixtures for retries and retains teardown errors', async () => {
    const c = createCollector('file')
    let setups = 0
    const test = c.api.test.extend<{ automatic: number }>({
      automatic: [
        async ({}, provide) => {
          const attempt = ++setups
          await provide(attempt)
          if (attempt === 1) throw new Error('teardown failed')
        },
        { auto: true },
      ],
    })
    test('retry teardown', { retry: 1 }, () => {})
    const result = await run(c)
    expect(result.cases.map((t) => t.status)).toEqual(['failed', 'passed'])
    expect(result.cases[0].errors[0].phase).toBe('cleanup')
    expect(setups).toBe(2)
  })

  it('propagates parent cancellation and runs resource cleanup', async () => {
    const c = createCollector('file')
    const controller = new AbortController()
    let cleaned = false
    c.api.test('cancel', async ({ signal, onTestFinished }) => {
      onTestFinished(() => {
        cleaned = true
      })
      const cancelled = new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true })
      )
      controller.abort()
      await cancelled
    })
    c.api.test('later', () => {
      throw new Error('must not run')
    })
    const result = await runCollected(
      c.close(),
      { ...options(), signal: controller.signal },
      () => {}
    )
    expect(result.cases.map((t) => t.status)).toEqual([
      'cancelled',
      'cancelled',
    ])
    expect(cleaned).toBe(true)
  })
})

it('runs C/D facade integration in a fresh process', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'assertion-integration.ts'),
  ]).catch((error) => {
    throw new Error([error.message, error.stdout, error.stderr].join('\n'))
  })
  expect(stdout).toContain('# tests 24')
  expect(stdout).toContain('# fail 0')
}, 30000)
