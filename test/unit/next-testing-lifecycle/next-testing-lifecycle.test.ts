import {
  initializeModuleCache,
  resetModules,
} from 'next/dist/experimental/testing/mocking/module-cache'
import { createModuleImportTracker } from 'next/dist/experimental/testing/runner/imports'
import { createAsyncScope } from 'next/dist/experimental/testing/runner/async-context'
/* eslint-disable no-empty-pattern -- Fixture callbacks require explicit destructuring. */
import {
  createCollector,
  collectTestCases,
  hasFocusedTests,
  selectedCases,
} from 'next/dist/experimental/testing/runner/collector'
import { runCollected } from 'next/dist/experimental/testing/runner/lifecycle'
import type { Suite, Task } from 'next/dist/experimental/testing/runner/tasks'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { shuffle } from 'next/dist/experimental/testing/runner/sequence'
import { assertTestFileCollection } from 'next/dist/experimental/testing/execution/collection'

// Semantic reference: Vitest checkout 0780a8e5b7967a4168173599e9c74fb79aab2483,
// packages/vitest/src/runtime/runner/{hooks,run,fixture}.ts. This corpus exercises
// Next's collector directly; it does not establish compiler/runtime integration.
const options = () => ({ runId: 'run', signal: new AbortController().signal })
const run = (collector: ReturnType<typeof createCollector>) =>
  runCollected(collector.close(), options(), () => {})

describe('Next-owned Vitest lifecycle', () => {
  it('provides fresh base test APIs to synchronous and asynchronous suite factories', async () => {
    const c = createCollector('file')
    const events: unknown[] = []
    c.api.describe('sync factory', (provided) => {
      events.push(['sync', typeof provided, provided === c.api.test])
      provided.beforeEach(() => {
        events.push(['beforeEach'])
      })
      provided('one', () => {
        events.push(['one'])
      })
      provided.skip('skip', () => {
        throw new Error('must skip')
      })
      provided.extend({ value: 3 })('fixture', ({ value }) => {
        events.push(['fixture', value])
        expect(value).toBe(3)
      })
      c.api.describe('nested', (nested) => {
        events.push(['nested', nested === provided, nested === c.api.test])
        nested('inner', () => {
          events.push(['inner'])
        })
      })
    })
    c.api.describe('async factory', async (provided) => {
      events.push(['async', typeof provided, provided === c.api.test])
      await Promise.resolve()
      provided('after await', () => {
        events.push(['after await'])
      })
    })
    c.api.describe.each([4])('table %i', function (value) {
      events.push(['table', value, arguments.length])
      c.api.test('row', () => {
        events.push(['row', value])
      })
    })
    c.api.describe.skip('skipped factory', (provided) => {
      events.push(['skip factory', typeof provided])
      provided('skipped child', () => {
        throw new Error('must skip')
      })
    })
    await c.settle()
    const result = await run(c)
    expect(result.cases.map(({ status }) => status)).toEqual([
      'passed',
      'skipped',
      'passed',
      'passed',
      'passed',
      'passed',
      'skipped',
    ])
    expect(events).toEqual([
      ['sync', 'function', false],
      ['nested', false, false],
      ['async', 'function', false],
      ['table', 4, 1],
      ['skip factory', 'function'],
      ['beforeEach'],
      ['one'],
      ['beforeEach'],
      ['fixture', 3],
      ['beforeEach'],
      ['inner'],
      ['after await'],
      ['row', 4],
    ])
  })

  it('resolves Unicode fixture dependencies through factories, aliases, builders and overrides', async () => {
    const c = createCollector('file')
    const events: unknown[] = []
    const custom = c.api.test.extend<{
      café: number
      Δ: number
      数据: { total: number }
    }>({
      café: 2,
      Δ: 3,
      数据: async ({ café, Δ }, provide) => {
        events.push(['data+', café, Δ])
        await provide({ total: café + Δ })
        events.push(['data-'])
      },
    })
    const owned = custom.extend('résumé', ({ 数据 }, { onCleanup }) => {
      events.push(['builder+', 数据.total])
      onCleanup(() => {
        events.push(['builder-'])
      })
      return 数据.total * 2
    })
    owned(
      'unicode dependency aliases',
      ({ café: accent, 数据: { total }, résumé: result }) => {
        expect([accent, total, result]).toEqual([2, 5, 10])
        events.push(['body', accent, total, result])
      }
    )
    c.api.describe('override', () => {
      owned.override({ café: 4 })
      owned(
        'unicode dependency replacement',
        ({ café: accent, 数据: { total }, résumé: result }) => {
          expect([accent, total, result]).toEqual([4, 7, 14])
          events.push(['body', accent, total, result])
        }
      )
    })
    const execution = await run(c)
    expect(execution.cases.map((test) => test.status)).toEqual([
      'passed',
      'passed',
    ])
    expect(execution.errors).toEqual([])
    expect(events).toEqual([
      ['data+', 2, 3],
      ['builder+', 5],
      ['body', 2, 5, 10],
      ['builder-'],
      ['data-'],
      ['data+', 4, 3],
      ['builder+', 7],
      ['body', 4, 7, 14],
      ['builder-'],
      ['data-'],
    ])
  })

  it('exposes global suite aliases and the deprecated scoped fixture override', async () => {
    const c = createCollector('file')
    const test = c.api.test.extend({ value: 'base' })
    expect(test.describe).toBe(c.api.describe)
    expect(test.suite).toBe(c.api.suite)
    expect(test.skip.describe).toBe(c.api.describe)
    expect(test.concurrent.suite).toBe(c.api.suite)
    const values: string[] = []
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      test.describe('outer', () => {
        test('base', ({ value }) => values.push(value))
        test.suite('nested', () => {
          expect(test.scoped({ value: 'nested' })).toBe(test)
          test('override', ({ value }) => values.push(value))
        })
        test('after nested', ({ value }) => values.push(value))
      })
      test.suite.each([1, 2])('table %i', (row) => {
        test(`row ${row}`, ({ value }) => values.push(`${value}:${row}`))
      })
      test.skip.describe('suite ignores test modifier', () => {
        test('runs', ({ value }) => values.push(value))
      })
      expect(warning).toHaveBeenCalledTimes(1)
      expect(warning).toHaveBeenCalledWith(
        'test.scoped() is deprecated and will be removed in future versions. Please use test.override() instead.'
      )
      const result = await run(c)
      expect(result.errors).toEqual([])
      expect(result.cases.map((test) => test.status)).toEqual(
        Array(6).fill('passed')
      )
      expect(values).toEqual([
        'base',
        'nested',
        'base',
        'base:1',
        'base:2',
        'base',
      ])
    } finally {
      warning.mockRestore()
    }
  })

  it('lists settled runnable declarations without hooks, fixtures or test execution', async () => {
    const c = createCollector('file')
    const never = () => {
      throw new Error('execution must not run during collection')
    }
    c.api.beforeAll(never)
    c.api.afterAll(never)
    const owned = c.api.test.extend('fixture', never)
    c.api.describe('suite', async () => {
      await Promise.resolve()
      owned('visible', ({ fixture }) => fixture)
      c.api.test.skip('hidden', never)
      c.api.test.todo('todo')
      c.api.describe.skip('hidden parent', () => c.api.test('hidden', never))
    })
    await c.settle()
    const root = c.close()
    expect(collectTestCases(root)).toEqual([
      { id: 'file/0/0', name: 'suite > visible' },
    ])
    expect(collectTestCases(root, { testNamePattern: 'missing' })).toEqual([])
    expect(
      collectTestCases(root, { testNamePattern: /^suite > visible$/ })
    ).toHaveLength(1)
  })

  it('validates separate collection identities and rejects forged execution metadata', () => {
    const artifact = { entryId: 'file', revision: 'immutable' }
    const valid = {
      version: 1,
      entryId: 'file',
      revision: 'immutable',
      cases: [{ id: 'file/0', name: 'case' }],
    }
    expect(() => assertTestFileCollection(valid, artifact)).not.toThrow()
    expect(() =>
      assertTestFileCollection({ ...valid, cases: [] }, artifact)
    ).not.toThrow()
    for (const invalid of [
      { ...valid, entryId: 'other' },
      { ...valid, revision: 'other' },
      { ...valid, cases: [...valid.cases, ...valid.cases] },
      { ...valid, cases: [{ id: 'other/0', name: 'case' }] },
      { ...valid, cases: [{ id: 'file/0', name: 'case', status: 'passed' }] },
      { ...valid, location: { line: 1, column: 1 } },
    ])
      expect(() => assertTestFileCollection(invalid, artifact)).toThrow()
  })

  it('uses authoritative nested focus for collected listing', () => {
    const c = createCollector('file')
    c.api.describe.only('outer', () => {
      c.api.test('ordinary', () => {})
      c.api.test.only('selected', () => {})
    })
    const root = c.close()
    expect(collectTestCases(root).map((test) => test.name)).toEqual([
      'outer > selected',
    ])
    expect(() => collectTestCases(root, { allowOnly: false })).toThrow(
      'focus and allowOnly:false is not implemented'
    )
    const hidden = createCollector('hidden')
    hidden.api.describe.skip('hidden parent', () =>
      hidden.api.test.only('hidden', () => {})
    )
    hidden.api.test('ordinary', () => {})
    expect(() =>
      collectTestCases(hidden.close(), { allowOnly: false })
    ).toThrow('focus and allowOnly:false is not implemented')
  })

  it('matches the independently pinned seeded shuffle vectors', () => {
    expect(shuffle([0, 1, 2, 3, 4, 5, 6, 7], 8127)).toEqual([
      1, 3, 5, 4, 6, 7, 2, 0,
    ])
    expect(shuffle([0, 1, 2, 3, 4, 5, 6, 7], 0)).toEqual([
      7, 6, 2, 3, 1, 5, 4, 0,
    ])
    expect(shuffle([], -1)).toEqual([])
  })

  it('shuffles sequential suite and test buckets with the same seed while preserving nested overrides', async () => {
    const c = createCollector('file')
    const trace: string[] = []
    c.api.describe.shuffle('parent', { shuffle: false }, () => {
      for (const name of ['t0', 't1', 't2'])
        c.api.test(name, () => {
          trace.push(name)
        })
      c.api.describe('ordered', { shuffle: false }, () => {
        c.api.test('a', () => {
          trace.push('a')
        })
        c.api.test('b', () => {
          trace.push('b')
        })
      })
      c.api.describe('inherited', () => {
        for (const name of ['x0', 'x1', 'x2'])
          c.api.test(name, () => {
            trace.push(name)
          })
      })
    })
    const result = await runCollected(
      c.close(),
      { ...options(), sequence: { seed: 8127 } },
      () => {}
    )
    expect(result.cases.every(({ status }) => status === 'passed')).toBe(true)
    expect(trace).toEqual(['t1', 't2', 't0', 'x1', 'x2', 'x0', 'a', 'b'])
  })

  it('preserves explicit false suite boundaries while shuffling ordinary tests', async () => {
    const c = createCollector('file')
    const trace: string[] = []
    c.api.describe.shuffle('parent', () => {
      c.api.test('before', () => {
        trace.push('before')
      })
      c.api.describe('explicit false suite', { concurrent: false }, () => {
        c.api.test('inside', ({ task }) => {
          trace.push('inside')
          expect(task.suite?.concurrent).toBe(false)
          expect(task.concurrent).toBeUndefined()
        })
      })
      c.api.test('after', () => {
        trace.push('after')
      })
    })
    const result = await runCollected(
      c.close(),
      { ...options(), sequence: { seed: 8127 } },
      () => {}
    )
    expect(result.errors).toEqual([])
    expect(result.cases.every(({ status }) => status === 'passed')).toBe(true)
    // Same-body published 5.0.4 control: false suite flags differ from the
    // undefined flags on the neighboring ordinary tests, before shuffling.
    expect(trace).toEqual(['before', 'inside', 'after'])
  })

  it('uses configured concurrent defaults without overriding explicit sequential declarations', async () => {
    const c = createCollector('file', { sequence: { concurrent: true } })
    let a!: () => void
    let b!: () => void
    const first = new Promise<void>((resolve) => {
      a = resolve
    })
    const second = new Promise<void>((resolve) => {
      b = resolve
    })
    let completed = 0
    c.api.describe('ordinary suite', () => {
      c.api.test('first', async () => {
        a()
        await second
        completed++
      })
      c.api.test('second', async () => {
        b()
        await first
        completed++
      })
      c.api.test('boundary', { concurrent: false }, () => {
        expect(completed).toBe(2)
      })
      c.api.describe('ordered child', { concurrent: false }, () => {
        c.api.test('one', () => {
          expect(++completed).toBe(3)
        })
        c.api.test('two', () => {
          expect(++completed).toBe(4)
        })
      })
    })
    const result = await run(c)
    expect(result.cases.every(({ status }) => status === 'passed')).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('keeps concurrent groups in declaration order and shuffles each sequential group independently', async () => {
    const c = createCollector('file', {
      sequence: { shuffle: { tests: true, files: false } },
    })
    const trace: string[] = []
    for (const name of ['a0', 'a1', 'a2'])
      c.api.test(name, () => {
        trace.push(name)
      })
    for (const name of ['c0', 'c1'])
      c.api.test.concurrent(name, { concurrent: false }, () => {
        trace.push(name)
      })
    for (const name of ['b0', 'b1', 'b2'])
      c.api.test(name, () => {
        trace.push(name)
      })
    const result = await runCollected(
      c.close(),
      { ...options(), sequence: { seed: 8127 } },
      () => {}
    )
    expect(result.cases.every(({ status }) => status === 'passed')).toBe(true)
    expect(trace).toEqual(['a1', 'a2', 'a0', 'c0', 'c1', 'b1', 'b2', 'b0'])
  })

  it('runs concurrent cases through a two-owner barrier with separate attempt identities', async () => {
    const c = createCollector('file')
    let first!: () => void
    let second!: () => void
    const a = new Promise<void>((resolve) => {
      first = resolve
    })
    const b = new Promise<void>((resolve) => {
      second = resolve
    })
    const owners: unknown[] = []
    c.api.test.concurrent('first', async (context) => {
      owners.push(context)
      first()
      await b
    })
    c.api.test.concurrent('second', async (context) => {
      owners.push(context)
      second()
      await a
    })
    const result = await run(c)
    expect(result.cases.map(({ status }) => status)).toEqual([
      'passed',
      'passed',
    ])
    expect(new Set(owners).size).toBe(2)
    expect(result.errors).toEqual([])
  })

  it('retains adjacent group boundaries and explicit sequential suite inheritance', async () => {
    const c = createCollector('file')
    const trace: string[] = []
    c.api.describe.concurrent('parent', () => {
      c.api.describe('ordered', { concurrent: false }, () => {
        c.api.test('first', async () => {
          trace.push('first start')
          await Promise.resolve()
          trace.push('first end')
        })
        c.api.test('second', () => {
          trace.push('second')
        })
      })
    })
    c.api.test.concurrent('group one', () => {
      trace.push('group one')
    })
    c.api.test('boundary', { concurrent: false }, () => {
      trace.push('boundary')
    })
    c.api.test.concurrent('group two', () => {
      trace.push('group two')
    })
    const result = await run(c)
    expect(result.cases.every(({ status }) => status === 'passed')).toBe(true)
    expect(trace.filter((entry) => entry !== 'group one')).toEqual([
      'first start',
      'first end',
      'second',
      'boundary',
      'group two',
    ])
    expect(trace.indexOf('group one')).toBeLessThan(trace.indexOf('boundary'))
  })

  it('bounds leaf cases across independently concurrent nested suites without deadlocking', async () => {
    const c = createCollector('file')
    let active = 0
    let peak = 0
    let started = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    ;['a', 'b'].forEach((suite) =>
      c.api.describe.concurrent(suite, () => {
        ;['first', 'second'].forEach((name) =>
          c.api.test(name, async () => {
            peak = Math.max(peak, ++active)
            if (++started === 2) release()
            await gate
            await Promise.resolve()
            active--
          })
        )
      })
    )
    const result = await runCollected(
      c.close(),
      { ...options(), maxConcurrency: 2 },
      () => {}
    )
    expect(result.cases).toHaveLength(4)
    expect(result.cases.every(({ status }) => status === 'passed')).toBe(true)
    expect(peak).toBe(2)
    expect(active).toBe(0)
  })

  it('keeps retries and test fixtures owned while a concurrent sibling remains active', async () => {
    const c = createCollector('file')
    let values = 0
    let cleaned = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const test = c.api.test.extend('value', ({}, { onCleanup }) => {
      onCleanup(() => {
        cleaned++
      })
      return ++values
    })
    test.concurrent('retrying', { retry: 1 }, ({ value }) => {
      if (value === 1) throw new Error('retry')
      release()
    })
    test.concurrent('sibling', async ({ value }) => {
      expect(value).toBe(2)
      await gate
    })
    const result = await run(c)
    expect(
      result.cases.filter(({ status }) => status === 'failed')
    ).toHaveLength(1)
    expect(
      result.cases.filter(({ status }) => status === 'passed')
    ).toHaveLength(2)
    expect(values).toBe(3)
    expect(cleaned).toBe(3)
  })

  it('preserves public context identity while retaining unique internal attempt identities', async () => {
    const c = createCollector('file')
    const contexts: unknown[] = []
    const attempts: string[] = []
    const signals: AbortSignal[] = []
    let tries = 0
    c.api.test('identity', { retry: 1, repeats: 1 }, (context) => {
      contexts.push(context)
      signals.push(context.signal)
      expect(context.task.context).toBe(context)
      context.onTestFinished((finished) => {
        expect(finished).toBe(context)
      })
      if (++tries === 1) throw new Error('first attempt')
    })
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        onCaseStart: (context) => {
          attempts.push(context.id)
        },
      },
      () => {}
    )
    expect(result.cases.map(({ status }) => status)).toEqual([
      'failed',
      'passed',
      'passed',
    ])
    expect(new Set(contexts).size).toBe(1)
    expect(new Set(signals).size).toBe(1)
    expect(new Set(attempts).size).toBe(3)
  })

  it('preserves the public context across fixture hooks, retries and finished listeners', async () => {
    const c = createCollector('file')
    const contexts: unknown[] = []
    let created = 0
    const test = c.api.test.extend('value', () => ++created)
    test.beforeEach(({ task }) => {
      contexts.push(task.context)
    })
    test.afterEach(({ task }) => {
      contexts.push(task.context)
    })
    test(
      'fixture identity',
      { retry: 1, repeats: 1 },
      ({ value, task, onTestFinished }) => {
        contexts.push(task.context)
        expect((task.context as any).value).toBe(value)
        onTestFinished((context) => {
          contexts.push(context)
        })
        if (value === 1) throw new Error('first attempt')
      }
    )
    const result = await run(c)
    expect(result.cases.map(({ status }) => status)).toEqual([
      'failed',
      'passed',
      'passed',
    ])
    expect(new Set(contexts).size).toBe(1)
    expect(created).toBe(3)
  })

  it('continues after a cooperative timed-out body settles and preserves the interruption veto', async () => {
    const c = createCollector('file')
    const trace: string[] = []
    c.api.test(
      'cooperative timeout',
      { timeout: 1 },
      async ({ signal, onTestFinished }) => {
        onTestFinished(() => {
          trace.push('cleanup')
        })
        await new Promise<void>((resolve) =>
          signal.addEventListener(
            'abort',
            () => {
              trace.push('body settled')
              resolve()
            },
            { once: true }
          )
        )
      }
    )
    c.api.test('following', () => {
      trace.push('following')
    })
    const result = await run(c)
    expect(result.cases.map(({ status }) => status)).toEqual([
      'failed',
      'passed',
    ])
    expect(result.cases[0].errors).toHaveLength(1)
    expect(result.interrupted).toBe(true)
    expect(trace).toEqual(['body settled', 'cleanup', 'following'])
  })

  it('retains poisoning when timed-out work ignores cancellation', async () => {
    const c = createCollector('file')
    c.api.test('unbounded', { timeout: 1 }, async ({ signal }) => {
      expect(signal.aborted).toBe(false)
      await new Promise(() => {})
    })
    c.api.test('following', () => {
      throw new Error('must not run')
    })
    const result = await run(c)
    expect(result.cases.map(({ status }) => status)).toEqual([
      'failed',
      'cancelled',
    ])
    expect(result.interrupted).toBe(true)
  })

  it('supports builder fixture values, dependencies and cleanup before afterAll', async () => {
    const c = createCollector('file')
    const trace: string[] = []
    const test = c.api.test
      .extend('seed', 21)
      .extend('value', async ({ seed }, { onCleanup }) => {
        onCleanup(() => {
          trace.push('cleanup')
        })
        return seed * 2
      })
    test('builder body', ({ value }) => {
      expect(value).toBe(42)
      trace.push('body')
    })
    c.api.afterAll(() => {
      expect(trace).toEqual(['body', 'cleanup'])
    })
    const result = await run(c)
    expect(result.cases[0].status).toBe('passed')
    expect(result.errors).toEqual([])
  })

  it('replaces flat fixture types while resolving parent and replaced peer dependencies', async () => {
    const c = createCollector('file')
    const original = c.api.test.extend<{ value: string; peer: string }>({
      value: 'old',
      peer: 'old peer',
    })
    const replacement = original.extend<{ value: number; peer: boolean }>({
      value: async ({ value, peer }, provide) => {
        await provide(value.length + Number(peer))
      },
      peer: true,
    })
    replacement('replacement', ({ value, peer }) => {
      expect(value).toBe(4)
      expect(peer).toBe(true)
    })
    original('original', ({ value, peer }) => {
      expect(value).toBe('old')
      expect(peer).toBe('old peer')
    })
    const result = await run(c)
    expect(result.cases.every(({ status }) => status === 'passed')).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('provides callable fixture values through an object factory', async () => {
    const c = createCollector('file')
    const test = c.api.test.extend<{ callback: () => number }>({
      callback: async ({}, provide) => {
        await provide(() => 42)
      },
    })
    test('callable value', ({ callback }) => {
      expect(callback()).toBe(42)
    })
    const result = await run(c)
    expect(result.cases[0].status).toBe('passed')
    expect(result.errors).toEqual([])
  })

  it('reports builder setup failures once without running registered cleanup', async () => {
    for (const duplicate of [false, true]) {
      const c = createCollector('file')
      let cleanups = 0
      const test = c.api.test.extend('value', async ({}, { onCleanup }) => {
        onCleanup(() => {
          cleanups++
        })
        if (duplicate)
          onCleanup(() => {
            cleanups++
          })
        throw new Error('builder setup')
      })
      test('blocked', ({ value }) => {
        throw new Error(`body must not run: ${value}`)
      })
      const result = await run(c)
      expect(result.cases[0].errors).toHaveLength(1)
      expect(String(result.cases[0].errors[0].error)).toContain(
        duplicate ? 'onCleanup can only be called once' : 'builder setup'
      )
      expect(cleanups).toBe(0)
      expect(result.errors).toEqual([])
    }
  })

  it('recreates test builders on retries and repeats while retaining file builders', async () => {
    const c = createCollector('file')
    let files = 0
    let fileCleanups = 0
    let tests = 0
    let testCleanups = 0
    const test = c.api.test
      .extend('file', { scope: 'file' }, ({}, { onCleanup }) => {
        files++
        onCleanup(() => {
          fileCleanups++
        })
        return 'file'
      })
      .extend('value', ({ file }, { onCleanup }) => {
        expect(file).toBe('file')
        onCleanup(() => {
          testCleanups++
        })
        return ++tests
      })
    test('retries and repeats', { retry: 1, repeats: 1 }, ({ value }) => {
      if (value === 1) throw new Error('retry')
    })
    const result = await run(c)
    expect(result.cases.map(({ status }) => status)).toEqual([
      'failed',
      'passed',
      'passed',
    ])
    expect([files, fileCleanups, tests, testCleanups]).toEqual([1, 1, 3, 3])
  })

  it('resolves builder overrides at execution time with nested parent access', async () => {
    const c = createCollector('file')
    const test = c.api.test.extend('value', () => 1)
    const values: number[] = []
    c.api.describe('overridden', () => {
      test('declared before override', ({ value }) => {
        values.push(value)
      })
      test.override('value', ({ value }) => value + 1)
      c.api.describe('nested', () => {
        test.override('value', ({ value }) => value * 2)
        test('nested override', ({ value }) => {
          values.push(value)
        })
      })
      test('after nested', ({ value }) => {
        values.push(value)
      })
    })
    test('outside override', ({ value }) => {
      values.push(value)
    })
    const result = await run(c)
    expect(result.cases.every(({ status }) => status === 'passed')).toBe(true)
    expect(values).toEqual([2, 4, 2, 1])
  })

  it('inherits root builder overrides when extending a test API', async () => {
    const c = createCollector('file')
    const base = c.api.test.extend('value', () => 1)
    const earlier = base.extend('other', ({ value }) => value + 1)
    base.override('value', () => 2)
    const later = base.extend('other', ({ value }) => value + 1)
    const values: number[] = []
    earlier('earlier extension', ({ value, other }) => {
      values.push(value, other)
    })
    later('later extension', ({ value, other }) => {
      values.push(value, other)
    })
    const result = await run(c)
    expect(result.cases.every(({ status }) => status === 'passed')).toBe(true)
    expect(values).toEqual([1, 2, 2, 3])
  })

  it('retains body failures and builder cleanup failures after successful setup', async () => {
    const c = createCollector('file')
    const test = c.api.test.extend('value', ({}, { onCleanup }) => {
      onCleanup(() => {
        throw new Error('builder cleanup')
      })
      return 1
    })
    test('body fails', ({ value }) => {
      expect(value).toBe(1)
      throw new Error('body')
    })
    const result = await run(c)
    expect(result.cases[0].errors.map(({ phase }) => phase)).toEqual([
      'test',
      'cleanup',
    ])
    expect(result.errors).toEqual([])
  })

  it('binds file fixture hooks and cleans the file before aroundAll teardown', async () => {
    const c = createCollector('file')
    const trace: string[] = []
    const test = c.api.test.extend(
      'value',
      { scope: 'file' },
      ({}, { onCleanup }) => {
        trace.push('file setup')
        onCleanup(() => {
          trace.push('file cleanup')
        })
        return 42
      }
    )
    test.aroundAll(async (execute, { value }) => {
      expect(value).toBe(42)
      trace.push('around setup')
      await execute()
      trace.push('around cleanup')
    })
    test.beforeAll(({ value }, suite) => {
      expect(value).toBe(42)
      expect(suite.type).toBe('suite')
      trace.push('beforeAll')
    })
    test.beforeEach(({ value }) => {
      expect(value).toBe(42)
      trace.push('beforeEach')
    })
    test.afterEach(({ value }) => {
      expect(value).toBe(42)
      trace.push('afterEach')
    })
    test.afterAll(({ value }) => {
      expect(value).toBe(42)
      trace.push('afterAll')
    })
    test('body', ({ value }) => {
      expect(value).toBe(42)
      trace.push('body')
    })
    const result = await run(c)
    expect(result.cases[0].status).toBe('passed')
    expect(result.errors).toEqual([])
    expect(trace).toEqual([
      'file setup',
      'around setup',
      'beforeAll',
      'beforeEach',
      'body',
      'afterEach',
      'afterAll',
      'file cleanup',
      'around cleanup',
    ])
  })

  it('suppresses test automatic fixtures in bound suite hooks', async () => {
    const c = createCollector('file')
    let automaticTests = 0
    let automaticFiles = 0
    const test = c.api.test
      .extend(
        'automaticFile',
        { scope: 'file', auto: true },
        () => ++automaticFiles
      )
      .extend('automaticTest', { auto: true }, () => ++automaticTests)
    test.beforeAll(() => {
      expect([automaticFiles, automaticTests]).toEqual([1, 0])
    })
    test.afterAll(() => {
      expect([automaticFiles, automaticTests]).toEqual([1, 1])
    })
    test('body', () => {})
    const result = await run(c)
    expect(result.cases[0].status).toBe('passed')
    expect(result.errors).toEqual([])
  })

  it('rejects requested test fixtures in bound suite hooks', async () => {
    const c = createCollector('file')
    const test = c.api.test.extend('value', () => 42)
    test.beforeAll(({ value }: any) => {
      throw new Error(`hook must not run: ${value}`)
    })
    test('blocked', () => {
      throw new Error('body must not run')
    })
    const result = await run(c)
    expect(result.cases[0]).toMatchObject({ status: 'skipped', errors: [] })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].phase).toBe('beforeAll')
    expect(String(result.errors[0].error)).toContain(
      'Test-scoped fixtures cannot be used inside beforeAll'
    )
  })

  it('allows a failed file builder to initialize on the next retry', async () => {
    const c = createCollector('file')
    let created = 0
    let cleanups = 0
    const test = c.api.test.extend(
      'value',
      { scope: 'file' },
      ({}, { onCleanup }) => {
        onCleanup(() => {
          cleanups++
        })
        if (++created === 1) throw new Error('first setup')
        return created
      }
    )
    test('retry file setup', { retry: 1 }, ({ value }) => {
      expect(value).toBe(2)
    })
    const result = await run(c)
    expect(result.cases.map(({ status }) => status)).toEqual([
      'failed',
      'passed',
    ])
    expect(result.cases[0].errors).toHaveLength(1)
    expect([created, cleanups]).toEqual([2, 1])
    expect(result.errors).toEqual([])
  })

  it('resolves bound suite hook overrides declared after hook registration', async () => {
    const c = createCollector('file')
    const test = c.api.test.extend('value', { scope: 'file' }, () => 1)
    const values: number[] = []
    test.beforeAll(({ value }) => {
      values.push(value)
    })
    test('body', ({ value }) => {
      values.push(value)
    })
    test.override('value', () => 2)
    test.afterAll(({ value }) => {
      values.push(value)
    })
    const result = await run(c)
    expect(result.cases[0].status).toBe('passed')
    expect(result.errors).toEqual([])
    expect(values).toEqual([2, 2, 2])
  })

  it('inherits runner retries while preserving explicit case overrides', async () => {
    const c = createCollector('file')
    let inherited = 0
    let explicit = 0
    c.api.test('inherits', () => {
      if (++inherited === 1) throw new Error('retry')
    })
    c.api.test('overrides', { retry: 0 }, () => {
      explicit++
      throw new Error('no retry')
    })
    const result = await runCollected(
      c.close(),
      { ...options(), retry: 1 },
      () => {}
    )
    expect(result.cases.map(({ status }) => status)).toEqual([
      'failed',
      'passed',
      'failed',
    ])
    expect([inherited, explicit]).toEqual([2, 1])
  })

  it('bails after final failed outcomes without aborting cleanup or counting expected failures', async () => {
    const c = createCollector('file')
    const log: string[] = []
    c.api.test.fails('expected', () => {
      throw new Error('expected')
    })
    c.api.test('failure', () => {
      throw new Error('failure')
    })
    c.api.test('never run', () => {
      log.push('body')
    })
    c.api.afterAll(() => {
      log.push('afterAll')
    })
    const controller = new AbortController()
    const result = await runCollected(
      c.close(),
      { ...options(), signal: controller.signal, bail: 1 },
      () => {}
    )
    expect(result.cases.map(({ status }) => status)).toEqual([
      'passed',
      'failed',
      'cancelled',
    ])
    expect(result.cases[2]).toMatchObject({
      bail: true,
      mode: 'run',
      errors: [],
    })
    expect(controller.signal.aborted).toBe(false)
    expect(result.interrupted).toBe(false)
    expect(log).toEqual(['afterAll'])
  })

  it('reports forbidden focus as a failed selected case after collecting all cases', async () => {
    const c = createCollector('file', {
      getRuntimeConfig: () => ({ allowOnly: false }),
    })
    c.api.test('unfocused', () => {
      throw new Error('must not run')
    })
    c.api.test.only('focused', () => {
      throw new Error('must not run')
    })
    const result = await runCollected(
      c.close(),
      { ...options(), allowOnly: false },
      () => {}
    )
    expect(result.cases.map(({ status }) => status)).toEqual([
      'skipped',
      'failed',
    ])
    expect((result.cases[1].errors[0].error as Error).message).toContain(
      'Unexpected .only modifier'
    )
  })

  it('allows an empty root while retaining failures for empty nested suites', async () => {
    for (const nested of [false, true]) {
      const c = createCollector('file')
      if (nested) c.api.describe('empty', () => {})
      const suites: { name: string; status: string }[] = []
      const result = await runCollected(
        c.close(),
        {
          ...options(),
          passWithNoTests: true,
          onSuiteEnd: (suite) => {
            suites.push(suite)
          },
        },
        () => {}
      )
      expect(result.errors).toHaveLength(nested ? 1 : 0)
      expect(suites.at(-1)?.status).toBe(nested ? 'failed' : 'passed')
    }
  })

  it('settles nested asynchronous collection and preserves sibling suite ownership', async () => {
    const c = createCollector('file')
    let release!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    c.api.describe('async', async () => {
      await barrier
      c.api.beforeEach(() => {})
      c.api.test('after await', () => {})
      c.api.describe('nested', async () => {
        await Promise.resolve()
        c.api.test('nested case', () => {})
      })
    })
    c.api.describe('sibling', () => {
      c.api.test('sibling case', () => {})
    })
    release()
    await c.settle()
    expect([...selectedCases(c.close()).keys()].map((test) => test.id)).toEqual(
      ['file/0/0', 'file/0/1/0', 'file/1/0']
    )
    expect((c.root.children[0] as any).hooks.beforeEach).toHaveLength(1)
    expect((c.root.children[1] as any).hooks.beforeEach).toHaveLength(0)
  })

  it('observes every asynchronous collection rejection and settles surviving siblings', async () => {
    const c = createCollector('file')
    for (const name of ['first', 'second']) {
      c.api.describe(name, async () => {
        await Promise.resolve()
        throw new Error(name)
      })
    }
    c.api.describe('survivor', async () => {
      await Promise.resolve()
      c.api.test('collected', () => {})
    })
    const failure = await c.settle().catch((error) => error)
    expect(failure).toBeInstanceOf(AggregateError)
    expect(failure.errors.map((error: Error) => error.message)).toEqual([
      'first',
      'second',
    ])
    expect(
      [...selectedCases(c.close()).keys()].map((test) => test.name)
    ).toEqual(['collected'])
  })

  it('reports suite outcomes independently of successful cases and includes empty suites', async () => {
    const c = createCollector('file')
    c.api.test('root', () => {})
    c.api.describe('empty', () => {})
    c.api.describe.skip('skipped empty', () => {})
    c.api.describe.todo('todo empty')
    c.api.describe('cleanup failure', () => {
      c.api.test('passes', () => {})
      c.api.afterAll(() => {
        throw new Error('cleanup failed')
      })
    })
    const suites: any[] = []
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        onSuiteEnd: (suite) => {
          suites.push(suite)
        },
      },
      () => {}
    )
    expect(result.cases.map((test) => test.status)).toEqual([
      'passed',
      'passed',
    ])
    expect(
      suites.map(({ name, status, mode }) => [name, status, mode])
    ).toEqual([
      ['empty', 'failed', 'run'],
      ['skipped empty', 'skipped', 'skip'],
      ['todo empty', 'skipped', 'todo'],
      ['cleanup failure', 'failed', 'run'],
      ['', 'failed', 'run'],
    ])
    expect(result.errors.map(({ error }) => (error as Error).message)).toEqual([
      'No test found in suite empty',
      'cleanup failed',
    ])
  })

  it('does not turn cancellation into an empty-suite failure', async () => {
    const c = createCollector('file')
    c.api.describe('empty', () => {})
    const controller = new AbortController()
    controller.abort()
    const suites: string[] = []
    const result = await runCollected(
      c.close(),
      {
        runId: 'cancelled',
        signal: controller.signal,
        onSuiteEnd: (suite) => {
          suites.push(suite.status)
        },
      },
      () => {}
    )
    expect(result.errors).toEqual([])
    expect(result.interrupted).toBe(true)
    expect(suites).toEqual(['cancelled', 'cancelled'])
  })

  it('finishes body assertions before teardown while retaining cleanup and listener ordering', async () => {
    const c = createCollector('file')
    const log: string[] = []
    c.api.beforeEach(() => () => {
      log.push('hook cleanup')
    })
    c.api.afterEach(() => {
      log.push('afterEach')
    })
    c.api.test('body', ({ onTestFinished, onTestFailed }) => {
      log.push('body')
      onTestFinished(() => {
        log.push('finished')
      })
      onTestFailed(() => {
        log.push('failed')
      })
    })
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        beginAttempt: () => ({
          async finishTest(failed) {
            log.push(`body check ${failed}`)
            throw new Error('missing assertion')
          },
          async checkpoint() {
            log.push('checkpoint')
          },
          async finalize() {
            log.push('finalize')
          },
          async dispose() {
            log.push('dispose')
          },
        }),
      },
      () => {}
    )
    expect(result.cases[0].status).toBe('failed')
    expect(log).toEqual([
      'body',
      'body check false',
      'afterEach',
      'hook cleanup',
      'finished',
      'checkpoint',
      'failed',
      'finalize',
      'dispose',
    ])
  })

  it('does not retain a failed retry as the suite outcome after a successful retry', async () => {
    const c = createCollector('file')
    let attempts = 0
    c.api.describe('retry', () => {
      c.api.test('recovers', { retry: 1 }, () => {
        if (++attempts === 1) throw new Error('first attempt')
      })
    })
    const suites: string[] = []
    await runCollected(
      c.close(),
      {
        ...options(),
        onSuiteEnd: (suite) => {
          suites.push(suite.status)
        },
      },
      () => {}
    )
    expect(suites).toEqual(['passed', 'passed'])
  })

  it('filters ancestor-qualified names before hooks without overriding focus or skip', async () => {
    const c = createCollector('file')
    const log: string[] = []
    c.api.describe('selected', () => {
      c.api.beforeAll(() => {
        log.push('before')
      })
      c.api.afterAll(() => {
        log.push('after')
      })
      c.api.test.only('match', () => {
        log.push('body')
      })
      c.api.test.only('other', () => {
        throw new Error('filtered')
      })
      c.api.test.skip('match', () => {
        throw new Error('skipped')
      })
      c.api.test('match', () => {
        throw new Error('unfocused')
      })
      c.api.test.todo('todo')
    })
    c.api.describe('unselected', () => {
      c.api.beforeAll(() => {
        throw new Error('filtered suite hook')
      })
      c.api.afterAll(() => {
        throw new Error('filtered suite teardown')
      })
      c.api.test.only('match', () => {
        throw new Error('filtered suite')
      })
    })
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        testNamePattern: '^selected > match$',
      },
      () => {}
    )
    expect(log).toEqual(['before', 'body', 'after'])
    expect(result.errors).toEqual([])
    expect(result.cases.map(({ status, mode }) => [status, mode])).toEqual([
      ['passed', 'run'],
      ['skipped', 'skip'],
      ['skipped', 'skip'],
      ['skipped', 'skip'],
      ['skipped', 'skip'],
      ['skipped', 'skip'],
    ])
  })

  it('rejects invalid name patterns before any hooks or bodies execute', async () => {
    const c = createCollector('file')
    const calls: string[] = []
    c.api.beforeAll(() => {
      calls.push('hook')
    })
    c.api.test('case', () => {
      calls.push('body')
    })
    await expect(
      runCollected(
        c.close(),
        {
          ...options(),
          testNamePattern: '[',
        },
        () => {}
      )
    ).rejects.toThrow(SyntaxError)
    expect(calls).toEqual([])
  })

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
    expect(result.cases[0]).toMatchObject({ status: 'skipped', errors: [] })
    expect(result.errors[0].phase).toBe('beforeAll')
    expect(starts).toEqual([])
    expect(log).toEqual([
      'active beforeAll',
      'disposed beforeAll',
      'inactive',
      'active afterAll',
      'after all',
      'disposed afterAll',
      'inactive',
    ])
  })

  it.each([false, true])(
    'retains beforeAll timeout failure and skipped descendant metadata (nested: %s)',
    async (nested) => {
      const c = createCollector('file')
      const trace: string[] = []
      const starts: string[] = []
      const suites: { name: string; mode: string; status: string }[] = []
      let descendants: Task[] | undefined
      const declare = () => {
        c.api.beforeAll(() => new Promise(() => {}), 1)
        c.api.afterAll(({}, suite?: Suite) => {
          trace.push('afterAll')
          descendants = suite!.tasks
        })
        c.api.test('blocked', () => {
          throw new Error('must not run')
        })
        c.api.describe('inner', () => {
          c.api.beforeAll(() => trace.push('inner beforeAll'))
          c.api.afterAll(() => trace.push('inner afterAll'))
          c.api.aroundAll(async (execute) => {
            trace.push('inner aroundAll')
            await execute()
          })
          c.api.test('inner blocked', () => trace.push('inner body'))
        })
      }
      if (nested) c.api.describe('nested', declare)
      else declare()
      const result = await runCollected(
        c.close(),
        {
          ...options(),
          onCaseStart: ({ testId }) => {
            starts.push(testId)
          },
          onSuiteEnd: ({ name, mode, status }) => {
            suites.push({ name, mode, status })
          },
        },
        () => {}
      )
      expect(result.cases[0]).toMatchObject({ status: 'skipped', errors: [] })
      expect(result.errors[0].phase).toBe('beforeAll')
      expect(result.cases).toHaveLength(2)
      expect(result.cases[1]).toMatchObject({ status: 'skipped', errors: [] })
      expect(result.errors.map(({ phase }) => phase)).toEqual(['beforeAll'])
      expect(trace).toEqual(['afterAll'])
      expect(starts).toEqual([])
      expect(descendants).toMatchObject([
        { name: 'blocked', mode: 'skip', result: { state: 'skip' } },
        {
          name: 'inner',
          mode: 'skip',
          result: { state: 'skip' },
          tasks: [
            { name: 'inner blocked', mode: 'skip', result: { state: 'skip' } },
          ],
        },
      ])
      expect(suites).toContainEqual({
        name: 'inner',
        mode: 'skip',
        status: 'skipped',
      })
      // Match B's file failure decision: the timed-out setup cannot be false green.
      expect(
        result.errors.length > 0 ||
          result.cases.some((test) => test.status === 'failed')
      ).toBe(true)
    }
  )

  it('passes the last serialized error to standalone retry predicates and stops when rejected', async () => {
    const c = createCollector('file')
    let attempts = 0
    const seen: unknown[] = []
    c.api.test(
      'predicate',
      {
        retry: {
          count: 3,
          condition(error) {
            seen.push([
              error.name,
              error.message,
              error.code,
              error.cause?.message,
              Object.getPrototypeOf(error) === null,
            ])
            return seen.length === 1
          },
        },
      },
      () => {
        attempts++
        throw new AggregateError(
          [
            new Error('first'),
            Object.assign(
              new TypeError('last', { cause: new Error('cause') }),
              { code: 'E_RETRY' }
            ),
          ],
          'wrapper'
        )
      }
    )
    const result = await run(c)
    expect(attempts).toBe(2)
    expect(result.cases.map((test) => test.status)).toEqual([
      'failed',
      'failed',
    ])
    expect(seen).toEqual([
      ['TypeError', 'last', 'E_RETRY', 'cause', true],
      ['TypeError', 'last', 'E_RETRY', 'cause', true],
    ])
  })

  it('allows cancellation to release a retry delay using captured real timers', async () => {
    const c = createCollector('file')
    const controller = new AbortController()
    let attempts = 0
    c.api.test(
      'cancel during delay',
      { retry: { count: 1, delay: 10000 } },
      () => {
        attempts++
        throw new Error('retry')
      }
    )
    const timer = globalThis.setTimeout
    const start = Date.now()
    try {
      globalThis.setTimeout = (() => {
        throw new Error('must use framework timer')
      }) as any
      const result = await runCollected(
        c.close(),
        {
          ...options(),
          signal: controller.signal,
          onCaseEnd(test) {
            if (test.status === 'failed') setImmediate(() => controller.abort())
          },
        },
        () => {}
      )
      expect(attempts).toBe(1)
      expect(result.interrupted).toBe(true)
      expect(Date.now() - start).toBeLessThan(1000)
    } finally {
      globalThis.setTimeout = timer
    }
  })

  it('releases suite cleanup when a standalone retry predicate throws', async () => {
    const c = createCollector('file')
    const failure = new Error('predicate failed')
    let cleaned = false
    c.api.afterAll(() => {
      cleaned = true
    })
    c.api.test(
      'throws',
      {
        retry: {
          count: 1,
          condition() {
            throw failure
          },
        },
      },
      () => {
        throw new Error('body')
      }
    )
    await expect(run(c)).rejects.toBe(failure)
    expect(cleaned).toBe(true)
  })

  it('rejects malformed structured retry options before collection', () => {
    for (const retry of [
      null,
      [],
      { count: -1 },
      { delay: Infinity },
      { condition: 'error' },
      { extra: 1 },
    ]) {
      const c = createCollector('file')
      expect(() => c.api.test('invalid', { retry } as any, () => {})).toThrow()
    }
  })

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
    expect(String(result.cases[0].errors[0].error)).toBe(
      'Error: Test timed out in 1ms.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".'
    )
  })

  it('rejects unknown fixture options while preserving static array values', async () => {
    const c = createCollector('file')
    expect(() =>
      c.api.test.extend<{ value: unknown }>({
        value: [
          async ({}, provide: (value: unknown) => Promise<void>) => {
            await provide(42)
          },
          { auto: false, unknown: true },
        ] as any,
      })
    ).toThrow('fixture option "unknown"')
    const arrayTest = c.api.test.extend<{ value: unknown[] }>({
      value: [42, { label: 'data' }],
    })
    arrayTest('array', ({ value }) =>
      expect(value).toEqual([42, { label: 'data' }])
    )
    const result = await run(c)
    expect(result.cases[0].status).toBe('passed')
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

  it('narrows nested focused suites to their independently focused descendants', async () => {
    const c = createCollector('file')
    const trace: string[] = []
    const test = (name: string) => () => {
      trace.push(name)
    }
    c.api.test('outside', test('outside'))
    c.api.describe.only('left', () => {
      c.api.test('ordinary', test('ordinary'))
      c.api.describe('middle', () => {
        c.api.test('sibling', test('sibling'))
        c.api.test.only('leaf', test('leaf'))
      })
      c.api.test.todo('pending')
    })
    c.api.describe.only('right', () => {
      c.api.test('ordinary', test('ordinary'))
      c.api.describe.only('inner', () => {
        c.api.test('first', test('first'))
        c.api.test('second', test('second'))
      })
    })
    const root = c.close()
    const declarations = [...selectedCases(root).keys()].map((test) => [
      test.id,
      test.mode,
    ])
    expect(
      [...selectedCases(root)].map(([test, mode]) => [test.id, mode])
    ).toEqual([
      ['file/0', 'skip'],
      ['file/1/0', 'skip'],
      ['file/1/1/0', 'skip'],
      ['file/1/1/1', 'run'],
      ['file/1/2', 'todo'],
      ['file/2/0', 'skip'],
      ['file/2/1/0', 'run'],
      ['file/2/1/1', 'run'],
    ])
    const result = await runCollected(root, options(), () => {})
    expect(trace).toEqual(['leaf', 'first', 'second'])
    expect(result.cases.map(({ status }) => status)).toEqual([
      'skipped',
      'skipped',
      'skipped',
      'passed',
      'skipped',
      'skipped',
      'passed',
      'passed',
    ])
    expect(
      [...selectedCases(root).keys()].map((test) => [test.id, test.mode])
    ).toEqual(declarations)
  })

  it.each(['skip', 'todo'] as const)(
    'records focus below a %s ancestor without reviving its cases',
    async (mode) => {
      const c = createCollector('file')
      const trace: string[] = []
      c.api.test('ordinary', () => trace.push('ordinary'))
      c.api.describe[mode]('excluded', () => {
        c.api.test.only('hidden focus', () => trace.push('hidden focus'))
        c.api.test('hidden ordinary', () => trace.push('hidden ordinary'))
      })
      const root = c.close()
      expect(hasFocusedTests(root)).toBe(true)
      expect(
        [...selectedCases(root)].map(([test, selection]) => [
          test.id,
          selection,
        ])
      ).toEqual([
        ['file/0', 'skip'],
        ['file/1/0', mode],
        ['file/1/1', mode],
      ])
      const result = await runCollected(root, options(), () => {})
      expect(trace).toEqual([])
      expect(result.cases.every(({ status }) => status === 'skipped')).toBe(
        true
      )
      expect(root.children[1].mode).toBe(mode)
      expect([...selectedCases(root).keys()][1].mode).toBe('only')
    }
  )

  it.each(['skip', 'todo'] as const)(
    'narrows an enclosing focused suite around a %s descendant focus',
    async (mode) => {
      const c = createCollector('file')
      const trace: string[] = []
      c.api.describe.only('outer', () => {
        c.api.test('ordinary', () => trace.push('ordinary'))
        c.api.describe[mode]('excluded', () => {
          c.api.test.only('hidden focus', () => trace.push('hidden focus'))
        })
        c.api.describe('sibling', () => {
          c.api.test('ordinary sibling', () => trace.push('ordinary sibling'))
        })
      })
      const root = c.close()
      expect(
        [...selectedCases(root)].map(([test, selection]) => [
          test.id,
          selection,
        ])
      ).toEqual([
        ['file/0/0', 'skip'],
        ['file/0/1/0', mode],
        ['file/0/2/0', 'skip'],
      ])
      await runCollected(root, options(), () => {})
      expect(trace).toEqual([])
    }
  )

  it('keeps ordinary suite descendants selected when no deeper focus exists', async () => {
    const c = createCollector('file')
    const trace: string[] = []
    c.api.test('outside', () => trace.push('outside'))
    c.api.describe.only('outer', () => {
      c.api.test('first', () => trace.push('first'))
      c.api.describe('inner', () => {
        c.api.test('second', () => trace.push('second'))
      })
      c.api.test.skip('skipped', () => trace.push('skipped'))
      c.api.test.todo('pending')
    })
    const result = await run(c)
    expect(trace).toEqual(['first', 'second'])
    expect(result.cases.map(({ mode }) => mode)).toEqual([
      'skip',
      'run',
      'run',
      'skip',
      'todo',
    ])
  })

  it('keeps nested focus bodies blocked when allowOnly is false', async () => {
    const c = createCollector('file')
    const trace: string[] = []
    c.api.describe.only('outer', () => {
      c.api.test('ordinary', () => trace.push('ordinary'))
      c.api.test.only('focused', () => trace.push('focused'))
    })
    const root = c.close()
    expect([...selectedCases(root).values()]).toEqual(['skip', 'run'])
    const result = await runCollected(
      root,
      { ...options(), allowOnly: false },
      () => {}
    )
    expect(trace).toEqual([])
    expect(result.errors.map(({ error }) => String(error))).toEqual([
      expect.stringContaining('Unexpected .only modifier'),
    ])
  })

  it('projects forbidden suite failures onto skipped descendant tasks without inheriting errors', async () => {
    const c = createCollector('file')
    const trace: string[] = []
    const phases: { phase: string; tasks: unknown[] }[] = []
    const snapshot = (task: Task): unknown => ({
      name: task.name,
      mode: task.mode,
      state: task.result?.state,
      errors: task.result?.errors?.map((error) => error.message) ?? [],
      ...(task.type === 'suite' ? { tasks: task.tasks.map(snapshot) } : {}),
    })
    c.api.beforeAll(({}, file?: Suite) => {
      phases.push({ phase: 'before', tasks: file!.tasks.map(snapshot) })
    })
    c.api.afterAll(({}, file?: Suite) => {
      phases.push({ phase: 'after', tasks: file!.tasks.map(snapshot) })
    })
    c.api.describe.only('outer', () => {
      c.api.beforeAll(() => trace.push('beforeAll must not run'))
      c.api.afterAll(() => trace.push('afterAll must not run'))
      c.api.test('ordinary', () => trace.push('ordinary'))
      c.api.test.only('focused', () => trace.push('focused'))
      c.api.describe.only('inner', () => {
        c.api.test('inner ordinary', () => trace.push('inner ordinary'))
        c.api.test.only('inner focused', () => trace.push('inner focused'))
        c.api.test.skip('skipped', () => trace.push('skipped'))
        c.api.test.todo('pending')
      })
      c.api.describe('ordinary suite', () => {
        c.api.test('leaf', () => trace.push('leaf'))
      })
    })
    c.api.test.only('direct focused', () => trace.push('direct focused'))
    const root = c.close()
    const declared = [...selectedCases(root)].map(([test]) => ({
      id: test.id,
      mode: test.mode,
    }))
    const starts: string[] = []
    const suites: { name: string; status: string; errors: number }[] = []
    const result = await runCollected(
      root,
      {
        ...options(),
        allowOnly: false,
        onCaseStart: ({ testId }) => {
          starts.push(testId)
        },
        onSuiteEnd: ({ name, status, errors }) => {
          suites.push({ name, status, errors: errors.length })
        },
      },
      () => {}
    )
    expect(
      [...selectedCases(root)].map(([test]) => ({
        id: test.id,
        mode: test.mode,
      }))
    ).toEqual(declared)
    expect(trace).toEqual([])
    expect(starts).toEqual([])
    expect(
      result.cases.map(({ status, errors }) => [status, errors.length])
    ).toEqual([
      ['skipped', 0],
      ['skipped', 1],
      ['skipped', 0],
      ['skipped', 1],
      ['skipped', 0],
      ['skipped', 0],
      ['skipped', 0],
      ['failed', 1],
    ])
    expect(suites).toEqual([
      { name: 'inner', status: 'skipped', errors: 1 },
      { name: 'ordinary suite', status: 'skipped', errors: 0 },
      { name: 'outer', status: 'failed', errors: 1 },
      { name: '', status: 'failed', errors: 0 },
    ])
    expect(result.errors).toHaveLength(1)
    const forbidden = expect.stringContaining('Unexpected .only modifier')
    const skipped = (name: string, errors: unknown[] = []) => ({
      name,
      mode: 'skip',
      state: 'skip',
      errors,
    })
    expect(phases).toEqual([
      {
        phase: 'before',
        tasks: [
          expect.objectContaining({
            name: 'outer',
            state: 'fail',
            errors: [forbidden],
          }),
          expect.objectContaining({
            name: 'direct focused',
            state: 'fail',
            errors: [forbidden],
          }),
        ],
      },
      {
        phase: 'after',
        tasks: [
          {
            name: 'outer',
            mode: 'run',
            state: 'fail',
            errors: [forbidden],
            tasks: [
              skipped('ordinary'),
              skipped('focused', [forbidden]),
              {
                ...skipped('inner', [forbidden]),
                tasks: [
                  skipped('inner ordinary'),
                  skipped('inner focused', [forbidden]),
                  skipped('skipped'),
                  skipped('pending'),
                ],
              },
              { ...skipped('ordinary suite'), tasks: [skipped('leaf')] },
            ],
          },
          {
            name: 'direct focused',
            mode: 'run',
            state: 'fail',
            errors: [forbidden],
          },
        ],
      },
    ])
  })

  it('retains direct forbidden focus failures without retry repeat or expected-failure inversion', async () => {
    const c = createCollector('file')
    let ran = 0
    c.api.test.fails.only('forbidden', { retry: 2, repeats: 2 }, () => {
      ran++
    })
    const result = await runCollected(
      c.close(),
      { ...options(), allowOnly: false },
      () => {}
    )
    expect(ran).toBe(0)
    expect(result.cases).toHaveLength(1)
    expect(result.cases[0]).toMatchObject({
      status: 'failed',
      attempt: { retry: 0, repeat: 0 },
    })
    expect(result.cases[0].errors).toHaveLength(1)
    expect((result.cases[0].errors[0].error as Error).message).toContain(
      'Unexpected .only modifier'
    )
  })

  it.each(['skip', 'todo'] as const)(
    'does not attach forbidden focus errors below a %s suite',
    async (mode) => {
      const c = createCollector('file')
      const trace: string[] = []
      c.api.test('ordinary', () => trace.push('ordinary'))
      c.api.describe[mode]('hidden', () => {
        c.api.test.only('focused', () => trace.push('focused'))
      })
      const result = await runCollected(
        c.close(),
        { ...options(), allowOnly: false },
        () => {}
      )
      expect(trace).toEqual([])
      expect(result.errors).toEqual([])
      expect(
        result.cases.map(({ status, errors }) => [status, errors.length])
      ).toEqual([
        ['skipped', 0],
        ['skipped', 0],
      ])
    }
  )

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

  it('discards returned setup cleanup when a later setup hook fails', async () => {
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
    ])
    expect(log).toEqual(['setup'])
  })

  it('retains body and returned cleanup failures after successful setup and teardown', async () => {
    const c = createCollector('file')
    c.api.beforeEach(() => () => {
      throw new Error('cleanup')
    })
    c.api.afterEach(() => {})
    c.api.test('body fails', () => {
      throw new Error('body')
    })
    const result = await run(c)
    expect(result.cases[0].errors.map((error) => error.phase)).toEqual([
      'test',
      'cleanup',
    ])
  })

  it('aroundEach wraps inherited setup, cleanup and listeners in registration order', async () => {
    const c = createCollector('file')
    const log: string[] = []
    let owner: unknown
    c.api.aroundEach(async (execute, context) => {
      owner = context
      log.push('outer+')
      await execute()
      log.push('outer-')
    })
    c.api.beforeEach(() => {
      log.push('setup')
      return () => {
        log.push('cleanup')
      }
    })
    c.api.afterEach(() => {
      log.push('after')
    })
    c.api.describe('nested', () => {
      c.api.aroundEach(async (execute) => {
        log.push('inner+')
        await execute()
        log.push('inner-')
      })
      c.api.test('body', (context) => {
        expect(context).toBe(owner)
        log.push('body')
        context.onTestFinished(() => {
          log.push('finished')
        })
      })
    })
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        maxConcurrency: 1,
        sequence: { hooks: 'parallel' },
      },
      () => {}
    )
    expect(result.cases[0].status).toBe('passed')
    expect(log).toEqual([
      'outer+',
      'inner+',
      'setup',
      'body',
      'after',
      'cleanup',
      'finished',
      'inner-',
      'outer-',
    ])
  })

  it('aroundEach retains nested teardown errors and wraps every retry', async () => {
    const c = createCollector('file')
    const log: string[] = []
    c.api.aroundEach(async (execute) => {
      log.push('outer+')
      await execute()
      log.push('outer-')
      throw new Error('outer teardown')
    })
    c.api.aroundEach(async (execute) => {
      log.push('inner+')
      await execute()
      throw new Error('inner teardown')
    })
    c.api.test('body', { retry: 1 }, () => {
      log.push('body')
    })
    const result = await run(c)
    expect(result.cases.map((value) => value.status)).toEqual([
      'failed',
      'failed',
    ])
    expect(
      result.cases[0].errors.map(({ error }) => (error as Error).message)
    ).toEqual(['inner teardown', 'outer teardown'])
    expect(log).toEqual([
      'outer+',
      'inner+',
      'body',
      'outer-',
      'outer+',
      'inner+',
      'body',
      'outer-',
    ])
  })

  it('aroundEach rejects missing and repeated continuation calls', async () => {
    for (const multiple of [false, true]) {
      const c = createCollector('file')
      let runs = 0
      c.api.aroundEach(async (execute) => {
        if (multiple) {
          await execute()
          await execute()
        }
      })
      c.api.test('body', () => {
        runs++
      })
      const result = await run(c)
      expect(runs).toBe(multiple ? 1 : 0)
      expect((result.cases[0].errors[0].error as Error).name).toBe(
        multiple ? 'AroundHookMultipleCallsError' : 'AroundHookSetupError'
      )
    }
  })

  it('aroundEach preserves wrapper fixtures until wrapper teardown', async () => {
    const c = createCollector('file')
    const log: string[] = []
    const test = c.api.test.extend<{ outer: string; inner: string }>({
      outer: async ({}, provide) => {
        log.push('fixture outer+')
        await provide('outer')
        log.push('fixture outer-')
      },
      inner: async ({ outer }, provide) => {
        log.push('fixture inner+')
        await provide(outer)
        log.push('fixture inner-')
      },
    })
    test.aroundEach(async (execute, { outer }) => {
      expect(outer).toBe('outer')
      log.push('around+')
      await execute()
      log.push('around-')
    })
    test('body', ({ inner }) => {
      expect(inner).toBe('outer')
      log.push('body')
    })
    const result = await run(c)
    expect(result.cases[0].status).toBe('passed')
    expect(log).toEqual([
      'fixture outer+',
      'around+',
      'fixture inner+',
      'body',
      'fixture inner-',
      'around-',
      'fixture outer-',
    ])
  })

  it('aroundEach aborts a timed-out wrapper and prevents late continuation execution', async () => {
    const c = createCollector('file')
    let continuation!: () => Promise<void>
    let signal!: AbortSignal
    c.api.aroundEach((execute, context) => {
      continuation = execute
      signal = context.signal
      return new Promise(() => {})
    }, 1)
    c.api.test('body', () => {
      throw new Error('body must not run')
    })
    c.api.test('following', () => {
      throw new Error('following must not run')
    })
    const result = await run(c)
    expect(result.interrupted).toBe(true)
    expect(signal.aborted).toBe(true)
    expect(result.cases.map(({ status }) => status)).toEqual([
      'failed',
      'cancelled',
    ])
    expect((result.cases[0].errors[0].error as Error).message).toContain(
      'setup phase'
    )
    await expect(continuation()).rejects.toThrow('AROUND_HOOK_ABORT')
  })

  it('aroundAll wraps local hooks and descendants and retains wrapper failures', async () => {
    const c = createCollector('file')
    const completed: { blockedDescendants?: boolean }[] = []
    const log: string[] = []
    c.api.aroundAll(async (execute) => {
      log.push('root+')
      await execute()
      log.push('root-')
    })
    c.api.beforeAll(() => {
      log.push('setup')
    })
    c.api.afterAll(() => {
      log.push('teardown')
    })
    c.api.describe('nested', () => {
      c.api.aroundAll(async (execute) => {
        log.push('nested+')
        await execute()
        log.push('nested-')
        throw new Error('around teardown')
      })
      c.api.test('body', () => {
        log.push('body')
      })
    })
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        onSuiteEnd: (suite) => {
          completed.push(suite)
        },
      },
      () => {}
    )
    expect(completed.map((suite) => suite.blockedDescendants)).toEqual([
      false,
      false,
    ])
    expect(result.cases[0].status).toBe('passed')
    expect(result.errors.map(({ phase }) => phase)).toEqual(['aroundAll'])
    expect(log).toEqual([
      'root+',
      'setup',
      'nested+',
      'body',
      'nested-',
      'teardown',
      'root-',
    ])
  })

  it('aroundAll skips descendants and does not run local hooks after wrapper setup failure', async () => {
    const c = createCollector('file')
    let file: Readonly<Suite> | undefined
    const starts: string[] = []
    const completed: { suiteId: string; blockedDescendants?: boolean }[] = []
    c.api.aroundAll((_execute, {}, suite) => {
      file = suite
      throw new Error('around setup')
    })
    c.api.beforeAll(() => {
      throw new Error('before must not run')
    })
    c.api.afterAll(() => {
      throw new Error('after must not run')
    })
    c.api.test('direct body', () => {
      throw new Error('direct body must not run')
    })
    c.api.describe('nested', () => {
      c.api.beforeAll(() => {
        throw new Error('nested before must not run')
      })
      c.api.afterAll(() => {
        throw new Error('nested after must not run')
      })
      c.api.test('body', () => {
        throw new Error('body must not run')
      })
    })
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        onSuiteEnd: (suite) => {
          completed.push(suite)
        },
        onCaseStart: ({ testId }) => {
          starts.push(testId)
        },
      },
      () => {}
    )
    expect(result.cases[0].status).toBe('skipped')
    expect(result.errors.map(({ error }) => (error as Error).message)).toEqual([
      'around setup',
    ])
    expect(result.cases).toHaveLength(2)
    expect(result.cases[1]).toMatchObject({ status: 'skipped', errors: [] })
    expect(starts).toEqual([])
    expect(
      completed.map(({ suiteId, blockedDescendants }) => ({
        suiteId,
        blockedDescendants,
      }))
    ).toEqual([
      { suiteId: 'file/1', blockedDescendants: false },
      { suiteId: 'file', blockedDescendants: true },
    ])
    expect(file!.tasks).toMatchObject([
      { name: 'direct body', mode: 'skip', result: { state: 'skip' } },
      {
        name: 'nested',
        mode: 'skip',
        result: { state: 'skip' },
        tasks: [{ name: 'body', mode: 'skip', result: { state: 'skip' } }],
      },
    ])
  })

  it('aroundAll resolves file fixtures and rejects test fixtures', async () => {
    for (const scope of ['test', 'file'] as const) {
      const c = createCollector('file')
      const test = c.api.test.extend<{ value: string }>({
        value: ['value', { scope }],
      })
      test.aroundAll(async (execute, { value }) => {
        expect(value).toBe('value')
        await execute()
      })
      test('body', ({ value }) => {
        expect(value).toBe('value')
      })
      const result = await run(c)
      expect(result.cases[0].status).toBe(
        scope === 'file' ? 'passed' : 'skipped'
      )
      expect(result.errors).toHaveLength(scope === 'file' ? 0 : 1)
      if (scope === 'test')
        expect((result.errors[0].error as Error).message).toContain(
          'Test-scoped fixtures'
        )
    }
  })

  it('stops afterAll hooks and returned suite cleanup after teardown failure', async () => {
    for (const sequence of ['stack', 'list'] as const) {
      const c = createCollector('file')
      const log: string[] = []
      c.api.aroundAll(async (execute) => {
        await execute()
        log.push('around teardown')
      })
      c.api.beforeAll(() => () => {
        log.push('returned cleanup')
      })
      const fail = () => {
        log.push('failed teardown')
        throw new Error('teardown')
      }
      const unreached = () => {
        log.push('unreached teardown')
      }
      c.api.afterAll(sequence === 'stack' ? unreached : fail)
      c.api.afterAll(sequence === 'stack' ? fail : unreached)
      c.api.test('body', () => {
        log.push('body')
      })
      const result = await runCollected(
        c.close(),
        { ...options(), sequence: { hooks: sequence } },
        () => {}
      )
      expect(result.cases[0].status).toBe('passed')
      expect(result.errors.map(({ phase }) => phase)).toEqual(['afterAll'])
      expect(log).toEqual(['body', 'failed teardown', 'around teardown'])
    }
  })

  it('retains suite failures while skipping unexecuted descendants', async () => {
    const c = createCollector('file')
    c.api.beforeAll(() => {
      throw new Error('before all')
    })
    c.api.afterAll(() => {
      throw new Error('after all')
    })
    c.api.describe('nested', () => c.api.test('blocked', () => {}))
    const result = await run(c)
    expect(result.cases[0]).toMatchObject({ status: 'skipped', errors: [] })
    expect(result.errors.map(({ phase }) => phase)).toEqual([
      'beforeAll',
      'afterAll',
    ])
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

  it('separates derived worker fixture owners while sharing retries in one declaration', async () => {
    const c = createCollector('file')
    const trace: string[] = []
    let creations = 0
    const owned = c.api.test.extend({
      worker: [
        async ({}, use) => {
          trace.push('worker+')
          await use({ id: ++creations })
          trace.push('worker-')
        },
        { scope: 'worker' },
      ],
    })
    const second = owned.extend({ extra: true })
    let value: unknown
    let tries = 0
    owned('retry', { retry: 1 }, ({ worker }) => {
      value ??= worker
      expect(worker).toBe(value)
      if (!tries++) throw new Error('retry')
    })
    second('second', ({ worker }) => expect(worker).not.toBe(value))
    const result = await run(c)
    expect(result.cases.map((test) => test.status)).toEqual([
      'failed',
      'passed',
      'passed',
    ])
    expect(result.errors).toEqual([])
    expect(creations).toBe(2)
    expect(trace).toEqual(['worker+', 'worker+', 'worker-', 'worker-'])
  })

  it('preserves the worker owner through suite test-fixture overrides', async () => {
    const c = createCollector('file')
    let created = 0
    const owned = c.api.test.extend({
      worker: [async ({}, use) => use(++created), { scope: 'worker' }],
      local: 1,
    })
    owned('first', ({ worker }) => expect(worker).toBe(1))
    c.api.describe('override', () => {
      owned.override('local', () => 99)
      owned('second', ({ worker, local }) => {
        expect(worker).toBe(1)
        expect(local).toBe(99)
      })
    })
    const result = await run(c)
    expect(result.cases.map((test) => test.status)).toEqual([
      'passed',
      'passed',
    ])
    expect(result.errors).toEqual([])
    expect(created).toBe(1)
  })

  it('keeps option-shaped two-argument builder values as plain test fixtures', async () => {
    const c = createCollector('file')
    const value = { scope: 'worker' }
    const owned = c.api.test.extend('value', value)
    owned('plain value', ({ value: actual }) => expect(actual).toBe(value))
    const result = await run(c)
    expect(result.cases[0].status).toBe('failed')
    expect(result.cases[0].errors).toHaveLength(1)
    const failure = result.cases[0].errors[0]
    expect(failure.phase).toBe('test')
    expect(failure.error).toHaveProperty('matcherResult.actual', {})
    expect(failure.error).toHaveProperty('matcherResult.expected', value)
    expect(failure.error).toHaveProperty('matcherResult.name', 'toBe')
    expect(result.errors).toEqual([])
  })

  it('rejects worker fixtures that depend on file, test or attempt state', async () => {
    const c = createCollector('file')
    const file = c.api.test.extend({
      file: [async ({}, use) => use(1), { scope: 'file' }],
      worker: [async ({ file }, use) => use(file), { scope: 'worker' }],
    })
    const test = c.api.test.extend({
      local: 1,
      worker: [async ({ local }, use) => use(local), { scope: 'worker' }],
    })
    const context = c.api.test.extend({
      worker: [async ({ signal }, use) => use(signal), { scope: 'worker' }],
    })
    file('file dependency', ({ worker }) => worker)
    test('test dependency', ({ worker }) => worker)
    context('context dependency', ({ worker }) => worker)
    const result = await run(c)
    expect(result.cases.map((test) => test.status)).toEqual([
      'failed',
      'failed',
      'failed',
    ])
    expect(result.cases.map((test) => String(test.errors[0].error))).toEqual([
      'Error: Worker fixture cannot depend on file fixture "file".',
      'Error: Worker fixture cannot depend on test fixture "local".',
      'Error: Worker fixture cannot access attempt context "signal".',
    ])
  })

  it('cleans file fixture dependencies before its independent worker owner', async () => {
    const c = createCollector('file')
    const trace: string[] = []
    const owned = c.api.test
      .extend('worker', { scope: 'worker' }, ({}, { onCleanup }) => {
        onCleanup(() => {
          trace.push('worker-')
        })
        return 42
      })
      .extend('file', { scope: 'file' }, ({ worker }, { onCleanup }) => {
        onCleanup(() => {
          trace.push('file-')
        })
        return worker
      })
    owned('body', ({ file }) => expect(file).toBe(42))
    const result = await run(c)
    expect(result.cases[0].status).toBe('passed')
    expect(result.errors).toEqual([])
    expect(trace).toEqual(['file-', 'worker-'])
  })

  it('rejects unsupported APIs and fixture scope dependencies explicitly', async () => {
    const c = createCollector('file')
    expect(() => (c.api.test as any).shuffle).toThrow(
      'does not support test.shuffle'
    )
    expect(() =>
      c.api.test('bad', { concurrent: 'yes' } as any, () => {})
    ).toThrow('Test concurrent must be a boolean')
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

    const overrides = createCollector('overrides')
    const scoped = overrides.api.test.extend<{ value: string }>({
      value: ['file', { scope: 'file' }],
    })
    overrides.api.describe('nested', () => {
      expect(() => scoped.override({ value: 'nested' })).toThrow(
        'cannot be defined with a file scope inside the describe block'
      )
    })
    expect(() =>
      scoped.override({ value: ['changed', { scope: 'test' }] })
    ).toThrow('already registered with a "file" scope')
  })

  it('collects parameterized tests and suites with stable names and values', async () => {
    const c = createCollector('file')
    const values: unknown[] = []
    c.api.test.each([
      [1, 2, 3],
      [2, 4, 6],
    ])('adds %i and %i as case %#', (left, right, sum) => {
      values.push(left + right, sum)
    })
    c.api.test.for([{ label: 'answer', value: 42 }])(
      '$label is $value',
      (item, context) => {
        values.push(item.value, context.signal.aborted)
      }
    )
    c.api.describe.each(['first', 'second'])('%s suite', (label) => {
      c.api.test(
        () => label,
        () => values.push(label)
      )
    })
    c.api.test('pending without callback')
    const result = await run(c)
    expect(result.cases.map(({ name, status }) => [name, status])).toEqual([
      ['adds 1 and 2 as case 0', 'passed'],
      ['adds 2 and 4 as case 1', 'passed'],
      ['answer is 42', 'passed'],
      ['first suite > <anonymous>', 'passed'],
      ['second suite > <anonymous>', 'passed'],
      ['pending without callback', 'skipped'],
    ])
    expect(values).toEqual([3, 3, 6, 6, 42, false, 'first', 'second'])
  })

  it('tracks repeat and retry identity and recreates test fixtures', async () => {
    const c = createCollector('file')
    const identities: string[] = []
    const cleanups: number[] = []
    let setup = 0
    const test = c.api.test.extend<{ value: number }>({
      value: async ({}, provide) => {
        const value = ++setup
        await provide(value)
        cleanups.push(value)
      },
    })
    test('repeat', { repeats: 1, retry: 1 }, ({ value }) => {
      const attempt = value === 1 ? 0 : value === 2 ? 1 : 0
      identities.push(`${value}:${attempt}`)
      if (value === 1) throw new Error('retry first repeat')
    })
    const result = await run(c)
    expect(
      result.cases.map(({ attempt, status }) => [
        attempt.repeat,
        attempt.retry,
        status,
      ])
    ).toEqual([
      [0, 0, 'failed'],
      [0, 1, 'passed'],
      [1, 0, 'passed'],
    ])
    expect(identities).toEqual(['1:0', '2:1', '3:0'])
    expect(cleanups).toEqual([1, 2, 3])
  })

  it('turns expected failures into passes after listeners and rejects unexpected passes', async () => {
    const c = createCollector('file')
    const log: string[] = []
    c.api.test.fails('expected', ({ onTestFailed }) => {
      onTestFailed(() => log.push('failed listener'))
      throw new Error('expected failure')
    })
    c.api.test.fails('unexpected pass', () => {})
    const result = await run(c)
    expect(log).toEqual(['failed listener'])
    expect(result.cases.map(({ status }) => status)).toEqual([
      'passed',
      'failed',
    ])
    expect(String(result.cases[1].errors[0].error)).toContain(
      'Expect test to fail'
    )
  })

  it('selects retries after expected-failure inversion for each repeat', async () => {
    const c = createCollector('file')
    const calls: string[] = []
    c.api.test.fails('expected', { retry: 2, repeats: 1 }, () => {
      calls.push('expected')
      throw new Error('expected')
    })
    let attempts = 0
    c.api.test.fails('recover', { retry: 1 }, () => {
      calls.push('recover')
      if (++attempts > 1) throw new Error('expected retry failure')
    })
    c.api.test.fails('unexpected', { retry: 1 }, () => {
      calls.push('unexpected')
    })
    const result = await run(c)
    expect(calls).toEqual([
      'expected',
      'expected',
      'recover',
      'recover',
      'unexpected',
      'unexpected',
    ])
    expect(
      result.cases.map((test) => [
        test.attempt.repeat,
        test.attempt.retry,
        test.status,
      ])
    ).toEqual([
      [0, 0, 'passed'],
      [1, 0, 'passed'],
      [0, 0, 'failed'],
      [0, 1, 'passed'],
      [0, 0, 'failed'],
      [0, 1, 'failed'],
    ])
  })

  it('overrides fixtures with inherited scope and supports aliases and defaults', async () => {
    const c = createCollector('file')
    const log: string[] = []
    const test = c.api.test.extend<{
      value: string
      derived: string
    }>({
      value: async ({}, provide) => {
        log.push('base setup')
        await provide('base')
        log.push('base cleanup')
      },
      derived: async ({ value: renamed = 'default' }, provide) => {
        await provide(`${renamed} derived`)
      },
    })
    test('base', ({ derived }) => log.push(derived))
    c.api.describe('override', () => {
      test.override({
        value: async ({ value }, provide) => {
          log.push(`override from ${value}`)
          await provide('override')
          log.push('override cleanup')
        },
      })
      test('child', ({ derived }) => {
        log.push(derived)
      })
    })
    test('base again', ({ derived }) => log.push(derived))
    const result = await run(c)
    expect(result.cases.map(({ status }) => status)).toEqual([
      'passed',
      'passed',
      'passed',
    ])
    expect(log).toEqual([
      'base setup',
      'base derived',
      'base cleanup',
      'base setup',
      'override from base',
      'override derived',
      'override cleanup',
      'base cleanup',
      'base setup',
      'base derived',
      'base cleanup',
    ])
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
  expect(stdout).toContain('# tests 66')
  expect(stdout).toContain('# fail 0')
}, 30000)

it.each(['error', 'primitive'])(
  'routes a real closed-file %s rejection through its original async owner',
  async (mode) => {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [
      join(__dirname, 'shared-worker-origin.cjs'),
      require.resolve('next/dist/experimental/testing/runner'),
      require.resolve('next/dist/experimental/testing/vitest'),
      mode,
    ])
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toEqual({
      origin: 'first',
      nextBodyActive: true,
      rawIdentity: true,
      snapshotsVetoed: true,
    })
  }
)

// These controls validate the cache owner and import tracker. The unchanged public
// module-reset acceptance fixture separately requires the native emitted graph.
describe('compiler-owned actual module cache reset', () => {
  function context() {
    return Object.assign(Object.create(null), {
      c: new Map([
        ['subject', { exports: { count: 1 } }],
        ['dependency', { exports: { count: 1 } }],
        ['facade', { exports: { identity: 'protected' } }],
        ['bootstrap', { exports: { identity: 'protected' } }],
      ]),
      M: new Map(
        ['subject', 'dependency', 'facade', 'bootstrap'].map((id) => [
          id,
          () => {},
        ])
      ),
      m: { id: 'bootstrap' },
    })
  }
  const manifest = {
    version: 1 as const,
    resettable: ['subject', 'dependency'],
    protected: ['facade'],
  }

  it('evicts only authorized evaluated records while retaining factories and held namespace objects', () => {
    const runtime = context()
    const held = runtime.c.get('subject')!
    const factories = [...runtime.M]
    const retire = jest.fn()
    const owner = initializeModuleCache(runtime, manifest, retire)
    try {
      resetModules()
      expect([...runtime.c.keys()]).toEqual(['facade', 'bootstrap'])
      expect([...runtime.M]).toEqual(factories)
      expect(held.exports.count).toBe(1)
      expect(retire).toHaveBeenCalledWith([held, { exports: { count: 1 } }])
      // The retained factory table, rather than a name/value cache, remains owned
      // by the actual compiled runtime; absent evaluations need no deletion.
      resetModules()
      expect(retire).toHaveBeenLastCalledWith([])
    } finally {
      owner.dispose()
    }
    expect(() => resetModules()).toThrow('active compiler-owned module cache')
  })

  it('validates the complete reset before mutation or an ownership handoff', () => {
    const runtime = context()
    const retire = jest.fn()
    const owner = initializeModuleCache(runtime, manifest, retire)
    try {
      runtime.M.delete('dependency')
      expect(() => resetModules()).toThrow('retained native factory')
      expect([...runtime.c.keys()]).toEqual([
        'subject',
        'dependency',
        'facade',
        'bootstrap',
      ])
      expect(retire).not.toHaveBeenCalled()
      runtime.M.set('dependency', () => {})
      retire.mockImplementationOnce(() => {
        throw new Error('tracker closed')
      })
      expect(() => resetModules()).toThrow('tracker closed')
      expect(runtime.c.has('subject')).toBe(true)
      const retained = runtime.c
      runtime.c = new Map(retained)
      expect(() => resetModules()).toThrow('owner changed after initialization')
      expect(retained.has('subject')).toBe(true)
    } finally {
      owner.dispose()
    }
    for (const resettable of [
      ['facade'],
      ['bootstrap'],
      ['subject', 'subject'],
    ])
      expect(() =>
        initializeModuleCache(runtime, { ...manifest, resettable }, () => {})
      ).toThrow('protected runtime identities')
  })

  it('rejects a closed originating scope without clearing a later owner cache', async () => {
    const late: Error[] = []
    const scope = createAsyncScope(
      { kind: 'collection', context: { id: 'first', name: 'first' } },
      (error) => late.push(error)
    )
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const continuation = scope.run(() => gate.then(() => resetModules()))
    const first = initializeModuleCache(context(), manifest, () => {})
    first.dispose()
    scope.close()
    const next = context()
    const second = initializeModuleCache(next, manifest, () => {})
    try {
      release()
      await expect(continuation).rejects.toThrow(
        'closed collection scope "first"'
      )
      expect(late).toHaveLength(1)
      expect(next.c.has('subject')).toBe(true)
    } finally {
      second.dispose()
    }
  })

  it('keeps evicted top-level-await evaluations visible until their actual settlement', async () => {
    const runtime = context()
    // Each file gets its own actual runtime prototype; no global timer is used
    // to decide whether the pending evaluation settled.
    Object.setPrototypeOf(runtime, {})
    let complete!: () => void
    const pending = new Promise<void>((resolve) => {
      complete = resolve
    })
    let observe!: () => void
    const observed = new Promise<void>((resolve) => {
      observe = resolve
    })
    const getter = () => {
      observe()
      return pending
    }
    const module = Object.defineProperties(
      {},
      { exports: { get: getter }, namespaceObject: { get: getter } }
    )
    runtime.c.set('subject', module)
    const tracker = createModuleImportTracker(runtime)
    const owner = initializeModuleCache(
      runtime,
      manifest,
      tracker.retireModules
    )
    try {
      resetModules()
      let settled = false
      const waiting = tracker.waitForImports().then(() => {
        settled = true
      })
      await observed
      expect(settled).toBe(false)
      expect(runtime.c.has('subject')).toBe(false)
      complete()
      await waiting
      expect(settled).toBe(true)
    } finally {
      owner.dispose()
      tracker.dispose()
    }
  })

  it('cancels settling of an evicted pending evaluation on real tracker disposal', async () => {
    const runtime = context()
    Object.setPrototypeOf(runtime, {})
    const pending = new Promise(() => {})
    const getter = () => pending
    runtime.c.set(
      'subject',
      Object.defineProperties(
        {},
        { exports: { get: getter }, namespaceObject: { get: getter } }
      )
    )
    const tracker = createModuleImportTracker(runtime)
    const owner = initializeModuleCache(
      runtime,
      manifest,
      tracker.retireModules
    )
    try {
      resetModules()
      const waiting = tracker.waitForImports()
      tracker.dispose()
      await expect(waiting).rejects.toThrow('cancelled during file cleanup')
    } finally {
      owner.dispose()
      tracker.dispose()
    }
  })
})

describe('immutable client ownership admission', () => {
  // This host runs saved client code in Node. Its real engine predicate stands
  // in for the separately tested Chromium startup capability, before imports.
  const { isPromise } = require('node:util/types')
  const nativePrototype = Promise.prototype
  const getPrototype = Object.getPrototypeOf
  const brand = Symbol.for('next.test.engine-promise-brand.v1')
  const previousBrand = Object.getOwnPropertyDescriptor(globalThis, brand)
  // Node's EventTarget/MessagePort prototypes are shared across Jest realms.
  // Saved browser code patches them, so restore the host before another suite
  // starts a real Node loader worker with its internal event-listener options.
  const hostProperties: [object, PropertyKey][] = [
    [Promise.prototype, 'then'],
    [EventTarget.prototype, 'addEventListener'],
    [EventTarget.prototype, 'removeEventListener'],
    [MessagePort.prototype, 'postMessage'],
    [MessagePort.prototype, 'close'],
    [MessagePort.prototype, 'onmessage'],
    ...[
      'MessageChannel',
      'structuredClone',
      'setTimeout',
      'setInterval',
      'queueMicrotask',
      'requestAnimationFrame',
      'requestIdleCallback',
    ].map((key): [object, PropertyKey] => [globalThis, key]),
  ]
  const hostDescriptors = hostProperties.map(([target, key]) => ({
    target,
    key,
    descriptor: Object.getOwnPropertyDescriptor(target, key),
  }))
  Object.defineProperty(globalThis, brand, {
    configurable: true,
    value(value: unknown) {
      return !isPromise(value)
        ? 0
        : getPrototype(value) === nativePrototype
          ? 1
          : 2
    },
  })
  afterAll(() => {
    for (const { target, key, descriptor } of hostDescriptors.reverse()) {
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else Reflect.deleteProperty(target, key)
    }
    if (previousBrand) Object.defineProperty(globalThis, brand, previousBrand)
    else delete (globalThis as { [key: symbol]: unknown })[brand]
  })
  const {
    validateSynchronousClient,
  } = require('next/dist/experimental/testing/client/validate')
  it.each(['retry', 'fixture', 'concurrent'])(
    'rejects unsupported %s before executing any body',
    async (mode) => {
      const c = createCollector('client'),
        body = jest.fn()
      if (mode === 'retry') c.api.test('retry', { retry: { count: 1 } }, body)
      else if (mode === 'fixture')
        c.api.test.extend('value', body)('fixture', body)
      else c.api.test.concurrent('concurrent', body)
      await c.settle()
      expect(() => validateSynchronousClient(c.close(), {})).toThrow(
        /Browser Mode/
      )
      expect(body).not.toHaveBeenCalled()
    }
  )
  it('declares serial case identities before executing any body', async () => {
    const c = createCollector('client'),
      body = jest.fn()
    c.api.test('one', body)
    c.api.describe('nested', () => c.api.test('two', body))
    await c.settle()
    expect(validateSynchronousClient(c.close(), {})).toEqual([
      { type: 'suite', id: 'client', parentId: null, name: '', mode: 'run' },
      {
        type: 'test',
        id: 'client/0',
        parentId: 'client',
        name: 'one',
        mode: 'run',
      },
      {
        type: 'suite',
        id: 'client/1',
        parentId: 'client',
        name: 'nested',
        mode: 'run',
      },
      {
        type: 'test',
        id: 'client/1/0',
        parentId: 'client/1',
        name: 'two',
        mode: 'run',
      },
    ])
    expect(body).not.toHaveBeenCalled()
  })
  it('admits asynchronous bodies, suite hooks and case cleanup within one owned page', async () => {
    const c = createCollector('client')
    c.api.beforeAll(async () => {})
    c.api.afterAll(async () => {})
    c.api.aroundAll(async (run) => run())
    c.api.aroundEach(async (run) => run())
    c.api.beforeEach(async () => {})
    c.api.afterEach(async () => {})
    c.api.test('async', async () => {})
    await c.settle()
    expect(() => validateSynchronousClient(c.close(), {})).not.toThrow()
  })
  it('uses its startup classifier after authored Symbol and prototype builtins change', async () => {
    const client = require('next/dist/experimental/testing/client/async-context')
    const helper = require('next/dist/experimental/testing/client/async-helper')
    const attempt = client.createAsyncScope(
      {
        kind: 'attempt',
        context: { id: 'builtin-mutation', name: 'mutation' },
      },
      () => {}
    )
    const symbolFor = Symbol.for
    const getPrototypeOf = Object.getPrototypeOf
    const observed: string[] = []
    Symbol.for = (key) => {
      observed.push(`Symbol.for:${key}`)
      throw new Error('authored Symbol.for must not run')
    }
    Object.getPrototypeOf = () => {
      observed.push('Object.getPrototypeOf')
      throw new Error('authored getPrototypeOf must not run')
    }
    let result: unknown
    try {
      result = await attempt.run(() =>
        helper._(function* () {
          yield 0
          const native = yield Promise.resolve(42)
          class Subclass extends Promise<unknown> {}
          const subclass = new Subclass((resolve) => resolve('subclass'))
          Object.defineProperty(subclass, 'then', {
            value(resolve: (value: string) => void) {
              client.assertBrowserApiScope('assertion')
              resolve('subclass')
            },
          })
          return [native, yield subclass]
        })()
      )
    } finally {
      Symbol.for = symbolFor
      Object.getPrototypeOf = getPrototypeOf
      attempt.close()
    }
    expect(result).toEqual([42, 'subclass'])
    expect(observed).toEqual([])
  })
  async function checkDeclarationSlots(client, collection) {
    const { createDeclarationStorage } = client
    const helper = require('next/dist/experimental/testing/client/async-helper')
    const suites = createDeclarationStorage()
    const nested = createDeclarationStorage()
    let releaseFirst!: () => void, releaseSecond!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve
    })
    const trace: string[] = []
    let retained: ReturnType<typeof client.captureContinuationScope>
    const first = collection.run(() =>
      suites.run('first', () =>
        helper._(function* () {
          retained = client.captureContinuationScope()
          trace.push(suites.getStore())
          yield firstGate
          trace.push(suites.getStore())
          nested.run(42, () => {
            expect(suites.getStore()).toBe('first')
            expect(nested.getStore()).toBe(42)
          })
          expect(nested.getStore()).toBeUndefined()
        })()
      )
    )
    const second = collection.run(() =>
      suites.run('second', () =>
        helper._(function* () {
          trace.push(suites.getStore())
          yield secondGate
          trace.push(suites.getStore())
        })()
      )
    )
    expect(suites.getStore()).toBeUndefined()
    expect(collection.run(() => suites.getStore())).toBeUndefined()
    releaseSecond()
    await second
    releaseFirst()
    await first
    expect(trace).toEqual(['first', 'second', 'second', 'first'])
    return retained!
  }
  it('retains Promise origins and refuses collection work during a live attempt', async () => {
    const client = require('next/dist/experimental/testing/client/async-context')
    const failures: Error[] = []
    const collection = client.createAsyncScope(
      { kind: 'collection', context: { id: 'file', name: 'file' } },
      (error: Error) => failures.push(error)
    )
    const retainedDeclarations = await checkDeclarationSlots(client, collection)
    expect(failures).toEqual([])
    let resume!: () => void
    const helper = require('next/dist/experimental/testing/client/async-helper')
    const pending = new Promise<void>((resolve) => {
      resume = resolve
    })
    const intercepted = jest.fn(() => {
      throw new Error('compiler continuation used an overridden then')
    })
    Object.defineProperty(pending, 'then', { value: intercepted })
    const work = collection.run(() =>
      helper._(function* () {
        yield pending
        expect(() => client.assertBrowserApiScope('assertion')).toThrow(
          /closed collection/
        )
      })()
    )
    collection.close()
    expect(() => retainedDeclarations.run(() => {})).not.toThrow()
    expect(() =>
      retainedDeclarations.run(() =>
        client.createDeclarationStorage().getStore()
      )
    ).toThrow('Late Browser Mode API access from closed collection scope')
    expect(failures).toHaveLength(1)
    const owner = { id: 'attempt', name: 'case' }
    const attempt = client.createAsyncScope(
      { kind: 'attempt', context: owner },
      (error: Error) => failures.push(error)
    )
    await attempt.run(() =>
      Promise.resolve().then(() => {
        client.invokeClientAttempt(owner, () =>
          client.assertBrowserApiScope('assertion')
        )
        resume()
        return work.then(() => {
          expect(client.getOriginatingAttempt()).toBe(owner)
          client.assertInternalAttemptOwner('attempt')
        })
      })
    )
    expect(intercepted).not.toHaveBeenCalled()
    const observed: string[] = []
    const thenable = {
      get then() {
        observed.push(`getter:${client.getOriginatingAttempt()?.id}`)
        return (resolve: (value: string) => void) => {
          observed.push(`then:${client.getOriginatingAttempt()?.id}`)
          resolve('assimilated')
        }
      },
    }
    const abrupt = Promise.resolve('native')
    Object.defineProperty(abrupt, 'constructor', {
      get() {
        throw new Error('constructor getter')
      },
    })
    let finalReads = 0
    const finalValue = {
      get then() {
        finalReads++
        expect(client.getOriginatingAttempt()).toBe(owner)
        return undefined
      },
    }
    await expect(
      attempt.run(() =>
        helper._(function* () {
          yield 0
          expect(yield thenable).toBe('assimilated')
          try {
            yield abrupt
            throw new Error('await lost its rejection')
          } catch (error) {
            expect(error.message).toBe('constructor getter')
            expect(client.getOriginatingAttempt()).toBe(owner)
          }
          return finalValue
        })()
      )
    ).resolves.toBe(finalValue)
    expect(finalReads).toBe(1)
    expect(observed).toEqual(['getter:attempt', 'then:attempt'])
    const order: string[] = []
    const ordered = attempt.run(() =>
      helper._(function* () {
        order.push('start')
        yield Promise.resolve()
        order.push('after-await')
      })()
    )
    queueMicrotask(() => order.push('microtask'))
    await ordered
    expect(order).toEqual(['start', 'after-await', 'microtask'])
    const returns: string[] = []
    const returned = attempt.run(() =>
      // eslint-disable-next-line require-yield -- Immediate return exercises async helper settlement before the next microtask.
      helper._(function* () {
        return 1
      })()
    )
    returned.then(() => returns.push('fulfilled'))
    queueMicrotask(() => returns.push('microtask'))
    await returned
    expect(returns).toEqual(['fulfilled', 'microtask'])
    const AsyncGenerator =
      require('next/dist/experimental/testing/client/async-generator')._
    const generator = new AsyncGenerator(
      (function* () {
        expect(client.getOriginatingAttempt()).toBe(owner)
        yield thenable
        expect(client.getOriginatingAttempt()).toBe(owner)
        return 'done'
      })()
    )
    await expect(attempt.run(() => generator.next())).resolves.toEqual({
      value: 'assimilated',
      done: false,
    })
    await expect(attempt.run(() => generator.next())).resolves.toEqual({
      value: 'done',
      done: true,
    })
    const OverloadYield =
      require('next/dist/experimental/testing/client/overload-yield')._
    const ordinaryValue = { v: 'ordinary value', k: 0 }
    const marked = new AsyncGenerator(
      (function* () {
        const value = yield new OverloadYield(Promise.resolve(1), 0)
        expect(client.getOriginatingAttempt()).toBe(owner)
        yield value
        yield ordinaryValue
      })()
    )
    await expect(attempt.run(() => marked.next())).resolves.toEqual({
      value: 1,
      done: false,
    })
    expect((await attempt.run(() => marked.next())).value).toBe(ordinaryValue)
    await expect(attempt.run(() => marked.next())).resolves.toEqual({
      value: undefined,
      done: true,
    })
    const retained = attempt.run(() => client.captureAsyncScope())
    attempt.close()
    expect(() =>
      retained.run(() => client.assertBrowserApiScope('assertion'))
    ).toThrow(/closed attempt/)
    expect(() => client.assertInternalAttemptOwner('attempt')).toThrow()
    expect(failures).toHaveLength(3)
  })
})

it('keeps internal raw Chai facts and original owner admission in a fresh process', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_CHAI145_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, 'next-chai-assertions-'))
  const argv = [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'chai-assertion-integration.ts'),
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    await fs.writeFile(join(evidence, 'stdout.log'), stdout)
    await fs.writeFile(join(evidence, 'stderr.log'), stderr)
    await fs.writeFile(
      join(evidence, 'original-child.json'),
      JSON.stringify(
        {
          pid: child.pid,
          argv: [process.execPath, ...argv],
          actualClose,
          stdoutClosed: child.stdout?.destroyed,
          stderrClosed: child.stderr?.destroyed,
          error: failure === undefined ? null : String(failure),
        },
        null,
        2
      )
    )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 3')
    expect(stdout).toContain('# pass 3')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_CHAI145_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

it('keeps actual Chai constructors bound to their original owner in a fresh process', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_CHAI145_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, 'next-chai-constructor-'))
  const argv = [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'chai-constructor-integration.ts'),
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    await fs.writeFile(join(evidence, 'stdout.log'), stdout)
    await fs.writeFile(join(evidence, 'stderr.log'), stderr)
    await fs.writeFile(
      join(evidence, 'original-child.json'),
      JSON.stringify(
        {
          pid: child.pid,
          argv: [process.execPath, ...argv],
          actualClose,
          stdoutClosed: child.stdout?.destroyed,
          stderrClosed: child.stderr?.destroyed,
          error: failure === undefined ? null : String(failure),
        },
        null,
        2
      )
    )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 2')
    expect(stdout).toContain('# pass 2')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_CHAI145_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

it('runs the literal Chai namespace contract and guarded plugin graph in a fresh process', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_CHAI145_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, 'next-chai-namespace-'))
  const argv = [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'chai-namespace-integration.ts'),
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    await fs.writeFile(join(evidence, 'stdout.log'), stdout)
    await fs.writeFile(join(evidence, 'stderr.log'), stderr)
    await fs.writeFile(
      join(evidence, 'original-child.json'),
      JSON.stringify(
        {
          pid: child.pid,
          argv: [process.execPath, ...argv],
          actualClose,
          stdoutClosed: child.stdout?.destroyed,
          stderrClosed: child.stderr?.destroyed,
          error: failure === undefined ? null : String(failure),
        },
        null,
        2
      )
    )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 5')
    expect(stdout).toContain('# pass 5')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_CHAI145_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

// Synthetic creator-cell components exercise real private Scope state. The
// local source fixture transform is the retained prototype, not the native pass;
// native admission/placement is covered separately by Rust and browser controls.
describe('Browser creator-cell ownership components', () => {
  const vm = require('node:vm')
  const fs = require('node:fs')
  const path = require('node:path')
  const ts = require('typescript')
  const { transform } = require('./creator-scope-transform.cjs')
  const hostProperties: [object, PropertyKey][] = [
    [Promise.prototype, 'then'],
    [EventTarget.prototype, 'addEventListener'],
    [EventTarget.prototype, 'removeEventListener'],
    [MessagePort.prototype, 'postMessage'],
    [MessagePort.prototype, 'close'],
    [MessagePort.prototype, 'onmessage'],
    ...[
      'MessageChannel',
      'structuredClone',
      'setTimeout',
      'setInterval',
      'queueMicrotask',
      'requestAnimationFrame',
      'requestIdleCallback',
    ].map((key): [object, PropertyKey] => [globalThis, key]),
  ]
  let saved: {
    target: object
    key: PropertyKey
    descriptor: PropertyDescriptor | undefined
  }[] = []
  let client: any
  beforeAll(() => {
    saved = hostProperties.map(([target, key]) => ({
      target,
      key,
      descriptor: Object.getOwnPropertyDescriptor(target, key),
    }))
    client = require('next/dist/experimental/testing/client/async-context')
  })
  afterAll(() => {
    for (const { target, key, descriptor } of saved.reverse()) {
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else Reflect.deleteProperty(target, key)
    }
  })
  const late: Error[] = []
  function scope(id: string) {
    const context = { id, name: id }
    return {
      context,
      scope: client.createAsyncScope(
        { kind: 'attempt', context },
        (error: Error) => late.push(error)
      ),
    }
  }
  function moduleOf(source: string) {
    const result = transform(source, '/component.mjs')
    const output = ts.transpileModule(result.code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText
    const module = { exports: {} as any }
    const run = vm.runInThisContext(
      '(function(require,module,exports){' + output + '\n})'
    )
    run(
      (id: string) => {
        if (id === 'next/dist/experimental/testing/client/async-context')
          return client
        throw new Error('Unexpected component dependency ' + id)
      },
      module,
      module.exports
    )
    return { exports: module.exports, result }
  }
  it('module NOOP neither creates authority nor erases an existing qualified caller', () => {
    const token = client.captureCreatorScope(),
      b = scope('noop-B')
    const leave = client.enterCreatorScope(token)
    expect(() => client.assertBrowserApiScope('assertion')).toThrow(
      /requires its originating/
    )
    leave()
    b.scope.run(() => {
      const restore = client.enterCreatorScope(token)
      try {
        expect(client.getOriginatingAttempt()).toBe(b.context)
      } finally {
        restore()
      }
      expect(client.getOriginatingAttempt()).toBe(b.context)
    })
    b.scope.close()
  })
  it('creator A always wins over B and exact prior B is restored', () => {
    const a = scope('live-A'),
      b = scope('live-B'),
      token = a.scope.run(() => client.captureCreatorScope())
    b.scope.run(() => {
      const restore = client.enterCreatorScope(token)
      try {
        expect(client.getOriginatingAttempt()).toBe(a.context)
      } finally {
        restore()
      }
      expect(client.getOriginatingAttempt()).toBe(b.context)
    })
    a.scope.close()
    b.scope.close()
  })
  it('closed A remains a tombstone inside B while harmless work can settle', () => {
    const a = scope('closed-A'),
      b = scope('closed-B'),
      token = a.scope.run(() => client.captureCreatorScope())
    a.scope.close()
    b.scope.run(() => {
      const restore = client.enterCreatorScope(token)
      try {
        expect(42).toBe(42)
        expect(() => client.assertBrowserApiScope('assertion')).toThrow(
          /closed attempt scope "closed-A"/
        )
      } finally {
        restore()
      }
      expect(client.getOriginatingAttempt()).toBe(b.context)
    })
    expect(late.at(-1)?.message).toContain('closed-A')
    b.scope.close()
  })
  it('unknown, copied and hostile cells cannot select a scope or run getters', () => {
    const a = scope('forged-A'),
      original = a.scope.run(() => client.captureCreatorScope())
    let traps = 0
    const hostile = new Proxy(
      {},
      {
        get() {
          traps++
          throw new Error('getter')
        },
        getPrototypeOf() {
          traps++
          throw new Error('prototype')
        },
      }
    )
    ;[{}, { ...original }, hostile].forEach((token) => {
      expect(() => client.enterCreatorScope(token)).toThrow(
        'Invalid Browser Mode creator cell'
      )
    })
    expect(traps).toBe(0)
    a.scope.close()
  })
  it('returned original functions preserve this, arguments, constructability, name and length', () => {
    const a = scope('function-A'),
      b = scope('function-B')
    const { exports: m } = moduleOf(
      `export function make(read) { return function named(first, ...rest) { return [read(), this, arguments.length, first, rest, new.target]; } }`
    )
    const fn = a.scope.run(() => m.make(() => client.getOriginatingAttempt())),
      receiver = {}
    expect(fn.name).toBe('named')
    expect(fn.length).toBe(1)
    expect(Object.hasOwn(fn, 'prototype')).toBe(true)
    b.scope.run(() => {
      const result = fn.call(receiver, 7, 8)
      expect(result).toEqual([a.context, receiver, 2, 7, [8], undefined])
      expect(client.getOriginatingAttempt()).toBe(b.context)
    })
    const constructed = new fn(1)
    expect(constructed[5]).toBe(fn)
    a.scope.close()
    b.scope.close()
  })
  it('class method keeps HomeObject/super, method name/length and nonconstructability', () => {
    const a = scope('class-A'),
      b = scope('class-B')
    const { exports: m } = moduleOf(
      `export function make(read) { class Base { value(x) { return [this, x]; } } class Sub extends Base { value(x) { return [read(), super.value(x)]; } } return Sub; }`
    )
    const Sub = a.scope.run(() => m.make(() => client.getOriginatingAttempt())),
      receiver = new Sub(),
      method = Sub.prototype.value
    expect(method.name).toBe('value')
    expect(method.length).toBe(1)
    expect(Object.hasOwn(method, 'prototype')).toBe(false)
    expect(() => new method()).toThrow(TypeError)
    b.scope.run(() => {
      expect(receiver.value(9)).toEqual([a.context, [receiver, 9]])
      expect(client.getOriginatingAttempt()).toBe(b.context)
    })
    a.scope.close()
    b.scope.close()
  })
  it('class computed keys and getter body run once without extra property reads', () => {
    const a = scope('key-A')
    const trace: string[] = []
    const { exports: m } = moduleOf(
      `export function make(key, read) { class Value { get [key()]() { return read(); } } return Value; }`
    )
    const Value = a.scope.run(() =>
      m.make(
        () => {
          trace.push('key')
          return 'answer'
        },
        () => {
          trace.push('body')
          return client.getOriginatingAttempt()
        }
      )
    )
    expect(trace).toEqual(['key'])
    expect(new Value().answer).toBe(a.context)
    expect(trace).toEqual(['key', 'body'])
    a.scope.close()
  })
  it('generated finally restores B after original abrupt completion and reentrancy', () => {
    const a = scope('throw-A'),
      b = scope('throw-B'),
      reason = new Error('original reason')
    const { exports: m } = moduleOf(
      `export function make(run) { return function () { return run(); } }`
    )
    const fn = a.scope.run(() =>
      m.make(() => {
        expect(client.getOriginatingAttempt()).toBe(a.context)
        throw reason
      })
    )
    b.scope.run(() => {
      expect(() => fn()).toThrow(reason)
      expect(client.getOriginatingAttempt()).toBe(b.context)
    })
    a.scope.close()
    b.scope.close()
  })
  it('unbraced returns create distinct cells on each actual evaluation', () => {
    const a = scope('repeat-A'),
      b = scope('repeat-B'),
      c = scope('repeat-C')
    const { exports: m } = moduleOf(
      `export function make(yes, read) { if (yes) return function () { return read(); }; return null; }`
    )
    const first = a.scope.run(() =>
        m.make(true, () => client.getOriginatingAttempt())
      ),
      second = b.scope.run(() =>
        m.make(true, () => client.getOriginatingAttempt())
      )
    expect(first).not.toBe(second)
    c.scope.run(() => {
      expect(first()).toBe(a.context)
      expect(second()).toBe(b.context)
      expect(client.getOriginatingAttempt()).toBe(c.context)
    })
    a.scope.close()
    b.scope.close()
    c.scope.close()
  })
  it('capture refuses unsupported lexical/parameter/suspension semantics explicitly', () => {
    for (const source of [
      `export function make() { return function (value = 1) { return value; } }`,
      `export function make() { return function ({ value }) { return value; } }`,
      `export function make() { eval('value'); return function () {}; }`,
      `export async function make() { class Value extends (await Promise.resolve(Object)) { value() {} } return Value; }`,
    ])
      expect(() => transform(source, '/unsupported.mjs')).toThrow(
        /Creator capture HOLD/
      )
  })
  it('original fixture source bytes remain exact and source maps retain those complete bytes', () => {
    const file = path.join(
      __dirname,
      '../app-dir/next-testing-stable-release-gaps/fixtures/browser-promise-await-observability/contract.case.mjs'
    )
    const source = fs.readFileSync(file, 'utf8'),
      result = transform(source, file)
    expect(
      result.coverage.filter((item: any) => item.kind === 'returned-function')
    ).toHaveLength(2)
    expect(
      result.coverage.filter((item: any) => item.kind === 'class-method')
    ).toHaveLength(2)
    expect(
      result.coverage.some((item: any) => item.kind === 'object-method')
    ).toBe(true)
    expect(result.map.sourcesContent).toEqual([source])
    expect(path.isAbsolute(result.map.sources[0])).toBe(true)
  })
})

it('runs literal upstream hidden Chai helpers with original construction ownership in a fresh process', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_CHAI145_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, 'next-chai-hidden-helper-'))
  const argv = [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'chai-hidden-helper-integration.ts'),
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    await fs.writeFile(join(evidence, 'stdout.log'), stdout)
    await fs.writeFile(join(evidence, 'stderr.log'), stderr)
    await fs.writeFile(
      join(evidence, 'original-child.json'),
      JSON.stringify(
        {
          pid: child.pid,
          argv: [process.execPath, ...argv],
          actualClose,
          stdoutClosed: child.stdout?.destroyed,
          stderrClosed: child.stderr?.destroyed,
          error: failure === undefined ? null : String(failure),
        },
        null,
        2
      )
    )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 3')
    expect(stdout).toContain('# pass 3')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_CHAI145_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

it('preserves length guard payload semantics and explicit Chai utility ownership boundaries in a fresh process', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_CHAI145_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, 'next-chai-utility-'))
  const argv = [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'chai-utility-integration.ts'),
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    await fs.writeFile(join(evidence, 'stdout.log'), stdout)
    await fs.writeFile(join(evidence, 'stderr.log'), stderr)
    await fs.writeFile(
      join(evidence, 'original-child.json'),
      JSON.stringify(
        {
          pid: child.pid,
          argv: [process.execPath, ...argv],
          actualClose,
          stdoutClosed: child.stdout?.destroyed,
          stderrClosed: child.stderr?.destroyed,
          error: failure === undefined ? null : String(failure),
        },
        null,
        2
      )
    )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 3')
    expect(stdout).toContain('# pass 3')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_CHAI145_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

it('preserves genuine proxify payload traces and assertion lifecycle in a fresh process', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_CHAI145_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, 'next-chai-proxify-'))
  const argv = [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'chai-proxify-integration.ts'),
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    await fs.writeFile(join(evidence, 'stdout.log'), stdout)
    await fs.writeFile(join(evidence, 'stderr.log'), stderr)
    await fs.writeFile(
      join(evidence, 'original-child.json'),
      JSON.stringify(
        {
          pid: child.pid,
          argv: [process.execPath, ...argv],
          actualClose,
          stdoutClosed: child.stdout?.destroyed,
          stderrClosed: child.stderr?.destroyed,
          error: failure === undefined ? null : String(failure),
        },
        null,
        2
      )
    )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 5')
    expect(stdout).toContain('# pass 5')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_CHAI145_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

it('matches Chai registration events and native listener behavior across file cleanup in a fresh process', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_CHAI145_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, 'next-chai-events-'))
  const argv = [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'chai-events-integration.ts'),
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    await fs.writeFile(join(evidence, 'stdout.log'), stdout)
    await fs.writeFile(join(evidence, 'stderr.log'), stderr)
    await fs.writeFile(
      join(evidence, 'original-child.json'),
      JSON.stringify(
        {
          pid: child.pid,
          argv: [process.execPath, ...argv],
          actualClose,
          stdoutClosed: child.stdout?.destroyed,
          stderrClosed: child.stderr?.destroyed,
          error: failure === undefined ? null : String(failure),
        },
        null,
        2
      )
    )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 3')
    expect(stdout).toContain('# pass 3')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_CHAI145_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

it('matches genuine Chai static setting aliases in a fresh process', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_CHAI145_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, 'next-chai-static-settings-'))
  const argv = [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'chai-static-settings-integration.ts'),
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    await fs.writeFile(join(evidence, 'stdout.log'), stdout)
    await fs.writeFile(join(evidence, 'stderr.log'), stderr)
    await fs.writeFile(
      join(evidence, 'original-child.json'),
      JSON.stringify(
        {
          pid: child.pid,
          argv: [process.execPath, ...argv],
          actualClose,
          stdoutClosed: child.stdout?.destroyed,
          stderrClosed: child.stderr?.destroyed,
          error: failure === undefined ? null : String(failure),
        },
        null,
        2
      )
    )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 1')
    expect(stdout).toContain('# pass 1')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_CHAI145_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

it('preserves Browser Chai namespace and should helper parity in a fresh process', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_CHAI145_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, 'next-chai-browser-'))
  const argv = [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'chai-browser-integration.ts'),
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    await fs.writeFile(join(evidence, 'stdout.log'), stdout)
    await fs.writeFile(join(evidence, 'stderr.log'), stderr)
    await fs.writeFile(
      join(evidence, 'original-child.json'),
      JSON.stringify(
        {
          pid: child.pid,
          argv: [process.execPath, ...argv],
          actualClose,
          stdoutClosed: child.stdout?.destroyed,
          stderrClosed: child.stderr?.destroyed,
          error: failure === undefined ? null : String(failure),
        },
        null,
        2
      )
    )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 1')
    expect(stdout).toContain('# pass 1')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_CHAI145_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

it('preserves Browser global stubs and fluent vi parity in a fresh process', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_CHAI145_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, 'next-browser-vi-'))
  const argv = [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'browser-vi-integration.ts'),
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    await fs.writeFile(join(evidence, 'stdout.log'), stdout)
    await fs.writeFile(join(evidence, 'stderr.log'), stderr)
    await fs.writeFile(
      join(evidence, 'original-child.json'),
      JSON.stringify(
        {
          pid: child.pid,
          argv: [process.execPath, ...argv],
          actualClose,
          stdoutClosed: child.stdout?.destroyed,
          stderrClosed: child.stderr?.destroyed,
          error: failure === undefined ? null : String(failure),
        },
        null,
        2
      )
    )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 1')
    expect(stdout).toContain('# pass 1')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_CHAI145_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

describe('Browser importMock file materialization', () => {
  it('completes the genuine automocker from a closed test in its live afterAll file', async () => {
    const promise = promisify(execFile)(
      process.execPath,
      [
        '--import',
        require.resolve('tsx'),
        '--test-reporter=tap',
        join(__dirname, 'browser-import-mock-integration.ts'),
      ],
      { env: { ...process.env }, maxBuffer: 8 * 1024 * 1024 }
    )
    let failure: any
    const { stdout, stderr } = await promise.catch((error) => {
      failure = error
      return { stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
    })
    const evidence = process.env.NEXT_TESTING_BROWSER_IMPORT_MOCK_EVIDENCE
    if (evidence) {
      const fs = require('node:fs') as typeof import('node:fs')
      fs.mkdirSync(evidence, { recursive: true })
      fs.writeFileSync(
        join(evidence, 'browser-import-mock-child.json'),
        JSON.stringify(
          {
            pid: promise.child.pid,
            stdout,
            stderr,
            failure: failure && {
              message: failure.message,
              code: failure.code,
              signal: failure.signal,
            },
          },
          null,
          2
        )
      )
    }
    if (failure) throw failure
    expect(stdout).toContain('# pass 1')
    expect(stdout).toContain('# fail 0')
    expect(stderr).not.toContain('Error:')
  })
})

it('records supplied tasks across completion with resolved artifact identity and retained files', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const {
    recordArtifact,
  } = require('next/dist/experimental/testing/runner/artifacts')
  const directory = await fs.mkdtemp(join(tmpdir(), 'next-artifact-data-'))
  const c = createCollector('artifacts')
  const published: any[] = []
  let held: any
  try {
    await fs.writeFile(join(directory, 'source.txt'), 'artifact bytes')
    c.api.test('first', async ({ task }) => {
      held = task
      const input = {
        type: 'probe:data',
        data: { value: 7 },
        attachments: [
          { body: new Uint8Array([0, 255, 65]) },
          { body: '', path: 'source.txt' },
        ],
      }
      const pending = recordArtifact(task, input)
      expect((input as any).location).toEqual({
        file: '/project/artifacts.test.ts',
        line: 4,
        column: 2,
      })
      expect(input.attachments[0].body).toBe('AP9B')
      expect(task.artifacts).toHaveLength(0)
      const value = await pending
      expect(value).not.toBe(input)
      expect(value.data).not.toBe(input.data)
      expect(value).toBe(task.artifacts[0])
      expect(input.attachments[1].path).toBe('source.txt')
      expect(await fs.readFile(value.attachments[1].path, 'utf8')).toBe(
        'artifact bytes'
      )
      expect(value.attachments[1]).toMatchObject({
        body: '',
        bodyEncoding: 'base64',
        contentType: 'text/plain',
      })
      const annotation = {
        type: 'internal:annotation',
        annotation: { message: 'raw', type: 'notice' },
      }
      expect(await recordArtifact(task, annotation)).toBe(annotation)
      expect((annotation as any).location).toBe(
        (annotation.annotation as any).location
      )
      expect(task.annotations).toEqual([])
      expect(task.artifacts).toHaveLength(1)
    })
    c.api.test('second', async ({ task }) => {
      const value = await recordArtifact(held, {
        type: 'probe:late',
        data: 'from second',
      })
      expect(held.result.state).toBe('pass')
      expect(held.artifacts[1]).toBe(value)
      expect(task.artifacts).toEqual([])
    })
    c.api.afterAll(async () => {
      await recordArtifact(held, { type: 'probe:teardown', data: true })
    })
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        projectDir: directory,
        getAnnotationLocation: () => ({
          file: '/project/artifacts.test.ts',
          line: 4,
          column: 2,
        }),
        onArtifact(context, artifact) {
          published.push({ testId: context.testId, artifact })
        },
      },
      () => {}
    )
    expect(result.cases.map((test) => test.status)).toEqual([
      'passed',
      'passed',
    ])
    expect(result.errors).toEqual([])
    expect(published.map((row) => row.testId)).toEqual(
      Array(3).fill('artifacts/0')
    )
    expect(published.map((row) => row.artifact)).toEqual(held.artifacts)
    await expect(
      recordArtifact(held, { type: 'probe:closed' })
    ).rejects.toThrow("doesn't support test artifacts")
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it('preserves recording rejection identity without appending or failing a handled test', async () => {
  const {
    recordArtifact,
  } = require('next/dist/experimental/testing/runner/artifacts')
  const c = createCollector('artifact-rejection')
  const failure = new Error('artifact sink failed')
  c.api.test('handles rejection', async ({ task }) => {
    await expect(recordArtifact(task, { type: 'probe:reject' })).rejects.toBe(
      failure
    )
    expect(task.artifacts).toEqual([])
    for (const attachment of [
      {},
      { body: 'body', path: 'path' },
      { path: 'path', bodyEncoding: 'utf-8' },
    ])
      await expect(
        recordArtifact(task, {
          type: 'probe:invalid',
          attachments: [attachment],
        })
      ).rejects.toBeInstanceOf(TypeError)
  })
  const result = await runCollected(
    c.close(),
    {
      ...options(),
      onArtifact() {
        throw failure
      },
    },
    () => {}
  )
  expect(result.cases.map((test) => test.status)).toEqual(['passed'])
  expect(result.errors).toEqual([])
})

it('records genuine artifact data and public types in a fresh process', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_CHAI145_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, 'next-artifact-data-'))
  const argv = [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'artifact-integration.ts'),
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    await fs.writeFile(join(evidence, 'stdout.log'), stdout)
    await fs.writeFile(join(evidence, 'stderr.log'), stderr)
    await fs.writeFile(
      join(evidence, 'original-child.json'),
      JSON.stringify(
        {
          pid: child.pid,
          argv: [process.execPath, ...argv],
          actualClose,
          stdoutClosed: child.stdout?.destroyed,
          stderrClosed: child.stderr?.destroyed,
          error: failure === undefined ? null : String(failure),
        },
        null,
        2
      )
    )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 2')
    expect(stdout).toContain('# pass 2')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_CHAI145_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

it('resolves Node artifact attachment paths from cwd without an explicit project directory', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { relative } = await import('node:path')
  const {
    recordArtifact,
  } = require('next/dist/experimental/testing/runner/artifacts')
  const directory = await fs.mkdtemp(join(tmpdir(), 'next-artifact-cwd-'))
  const source = join(directory, 'source.txt')
  const c = createCollector('artifact-cwd')
  try {
    await fs.writeFile(source, 'cwd artifact bytes')
    c.api.test('uses the ordinary cwd path fallback', async ({ task }) => {
      const artifact = await recordArtifact(task, {
        type: 'probe:cwd',
        attachments: [{ path: relative(process.cwd(), source) }],
      })
      expect(await fs.readFile(artifact.attachments[0].path, 'utf8')).toBe(
        'cwd artifact bytes'
      )
      expect(
        artifact.attachments[0].path.startsWith(join(directory, 'retained'))
      ).toBe(true)
      expect(task.artifacts[0]).toBe(artifact)
    })
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        attachmentsDir: join(directory, 'retained'),
      },
      () => {}
    )
    expect(result.cases.map((test) => test.status)).toEqual(['passed'])
    expect(result.errors).toEqual([])
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
it.each(['node', 'browser'] as const)(
  'preserves actual %s real-wait and assertion lifetime behavior in a fresh process',
  async (mode) => {
    const fs = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const base = process.env.NEXT_TESTING_WAITS_EVIDENCE ?? tmpdir()
    await fs.mkdir(base, { recursive: true })
    const evidence = await fs.mkdtemp(join(base, `next-real-waits-${mode}-`))
    const argv = [
      '--test-reporter=tap',
      join(__dirname, 'browser-real-waits-integration.cjs'),
      mode,
    ]
    const pending = promisify(execFile)(process.execPath, argv, {
      timeout: 20000,
    })
    const child = pending.child
    const closed = new Promise<{
      code: number | null
      signal: NodeJS.Signals | null
    }>((resolve) => {
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    let stdout = ''
    let stderr = ''
    let failure: unknown
    try {
      try {
        const result = await pending
        stdout = result.stdout
        stderr = result.stderr
      } catch (error) {
        failure = error
        const raw = error as { stdout?: string; stderr?: string }
        stdout = raw.stdout ?? ''
        stderr = raw.stderr ?? ''
      }
      const actualClose = await closed
      const saved = await Promise.allSettled([
        fs.writeFile(join(evidence, 'stdout.log'), stdout),
        fs.writeFile(join(evidence, 'stderr.log'), stderr),
        fs.writeFile(
          join(evidence, 'original-child.json'),
          JSON.stringify(
            {
              pid: child.pid,
              argv: [process.execPath, ...argv],
              actualClose,
              stdoutClosed: child.stdout?.destroyed,
              stderrClosed: child.stderr?.destroyed,
              error: failure === undefined ? null : String(failure),
            },
            null,
            2
          )
        ),
      ])
      const errors = saved
        .filter(
          (row): row is PromiseRejectedResult => row.status === 'rejected'
        )
        .map((row) => row.reason)
      if (errors.length)
        throw new AggregateError(
          errors,
          'Could not retain real-wait child output'
        )
      if (failure !== undefined) throw failure
      expect(actualClose).toEqual({ code: 0, signal: null })
      expect(stdout).toContain('# tests 1')
      expect(stdout).toContain('# pass 1')
      expect(stdout).toContain('# fail 0')
    } finally {
      if (!process.env.NEXT_TESTING_WAITS_EVIDENCE)
        await fs.rm(evidence, { recursive: true, force: true })
    }
  },
  30000
)

it.each(['node', 'browser', 'browser-late'] as const)(
  'preserves actual %s fake-clock algorithms and public fluent identity in a fresh process',
  async (mode) => {
    const fs = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const base = process.env.NEXT_TESTING_FAKE_TIMERS_EVIDENCE ?? tmpdir()
    await fs.mkdir(base, { recursive: true })
    const evidence = await fs.mkdtemp(join(base, `next-fake-timers-${mode}-`))
    const argv = [
      '--test-reporter=tap',
      join(__dirname, 'browser-fake-timers-integration.cjs'),
      mode,
    ]
    const pending = promisify(execFile)(process.execPath, argv, {
      timeout: 20000,
    })
    const child = pending.child
    const closed = new Promise<{
      code: number | null
      signal: NodeJS.Signals | null
    }>((resolve) => {
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    let stdout = ''
    let stderr = ''
    let failure: unknown
    try {
      try {
        const result = await pending
        stdout = result.stdout
        stderr = result.stderr
      } catch (error) {
        failure = error
        const raw = error as { stdout?: string; stderr?: string }
        stdout = raw.stdout ?? ''
        stderr = raw.stderr ?? ''
      }
      const actualClose = await closed
      const saved = await Promise.allSettled([
        fs.writeFile(join(evidence, 'stdout.log'), stdout),
        fs.writeFile(join(evidence, 'stderr.log'), stderr),
        fs.writeFile(
          join(evidence, 'original-child.json'),
          JSON.stringify(
            {
              pid: child.pid,
              argv: [process.execPath, ...argv],
              actualClose,
              stdoutClosed: child.stdout?.destroyed,
              stderrClosed: child.stderr?.destroyed,
              error: failure === undefined ? null : String(failure),
            },
            null,
            2
          )
        ),
      ])
      const errors = saved
        .filter(
          (row): row is PromiseRejectedResult => row.status === 'rejected'
        )
        .map((row) => row.reason)
      if (errors.length)
        throw new AggregateError(
          errors,
          'Could not retain fake-timer child output'
        )
      if (failure !== undefined) throw failure
      expect(actualClose).toEqual({ code: 0, signal: null })
      expect(stdout).toContain('# tests 1')
      expect(stdout).toContain('# pass 1')
      expect(stdout).toContain('# fail 0')
    } finally {
      if (!process.env.NEXT_TESTING_FAKE_TIMERS_EVIDENCE)
        await fs.rm(evidence, { recursive: true, force: true })
    }
  },
  30000
)

it('preserves genuine project fake-timer defaults and shallow per-call overrides in the Browser backend', async () => {
  const mode = 'browser-project'
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_FAKE_TIMERS_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, `next-fake-timers-${mode}-`))
  const argv = [
    '--test-reporter=tap',
    join(__dirname, 'browser-fake-timers-integration.cjs'),
    mode,
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    const saved = await Promise.allSettled([
      fs.writeFile(join(evidence, 'stdout.log'), stdout),
      fs.writeFile(join(evidence, 'stderr.log'), stderr),
      fs.writeFile(
        join(evidence, 'original-child.json'),
        JSON.stringify(
          {
            pid: child.pid,
            argv: [process.execPath, ...argv],
            actualClose,
            stdoutClosed: child.stdout?.destroyed,
            stderrClosed: child.stderr?.destroyed,
            error: failure === undefined ? null : String(failure),
          },
          null,
          2
        )
      ),
    ])
    const errors = saved
      .filter((row): row is PromiseRejectedResult => row.status === 'rejected')
      .map((row) => row.reason)
    if (errors.length)
      throw new AggregateError(
        errors,
        'Could not retain fake-timer child output'
      )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 1')
    expect(stdout).toContain('# pass 1')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_FAKE_TIMERS_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

it('reports real lifecycle durations across retained fake Date', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_REAL_CLOCK_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, 'next-lifecycle-clock-'))
  const argv = [
    '--test-reporter=tap',
    join(__dirname, 'lifecycle-real-clock.cjs'),
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    const saved = await Promise.allSettled([
      fs.writeFile(join(evidence, 'stdout.log'), stdout),
      fs.writeFile(join(evidence, 'stderr.log'), stderr),
      fs.writeFile(
        join(evidence, 'original-child.json'),
        JSON.stringify(
          {
            pid: child.pid,
            argv: [process.execPath, ...argv],
            actualClose,
            stdoutClosed: child.stdout?.destroyed,
            stderrClosed: child.stderr?.destroyed,
            error: failure === undefined ? null : String(failure),
          },
          null,
          2
        )
      ),
    ])
    const errors = saved
      .filter((row): row is PromiseRejectedResult => row.status === 'rejected')
      .map((row) => row.reason)
    if (errors.length)
      throw new AggregateError(
        errors,
        'Could not retain lifecycle-clock child output'
      )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 1')
    expect(stdout).toContain('# pass 1')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_REAL_CLOCK_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

it('preserves the pinned zero-argument public next-timer surface', async () => {
  type PublicVi = typeof import('next/dist/experimental/testing/vitest').vi
  const zeroArgumentSurface: [
    Parameters<PublicVi['advanceTimersToNextTimer']> extends [] ? true : false,
    Parameters<PublicVi['advanceTimersToNextTimerAsync']> extends []
      ? true
      : false,
  ] = [true, true]
  expect(zeroArgumentSurface).toEqual([true, true])
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_NEXT_TIMER_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, 'next-public-next-timer-'))
  const argv = [
    '--test-reporter=tap',
    join(__dirname, 'timer-next-step-api.cjs'),
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    const saved = await Promise.allSettled([
      fs.writeFile(join(evidence, 'stdout.log'), stdout),
      fs.writeFile(join(evidence, 'stderr.log'), stderr),
      fs.writeFile(
        join(evidence, 'original-child.json'),
        JSON.stringify(
          {
            pid: child.pid,
            argv: [process.execPath, ...argv],
            actualClose,
            stdoutClosed: child.stdout?.destroyed,
            stderrClosed: child.stderr?.destroyed,
            error: failure === undefined ? null : String(failure),
          },
          null,
          2
        )
      ),
    ])
    const errors = saved
      .filter((row): row is PromiseRejectedResult => row.status === 'rejected')
      .map((row) => row.reason)
    if (errors.length)
      throw new AggregateError(
        errors,
        'Could not retain next-timer child output'
      )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 1')
    expect(stdout).toContain('# pass 1')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_NEXT_TIMER_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

it('preserves genuine mutable Browser clock configuration and saved project defaults', async () => {
  type PublicVi = typeof import('next/dist/experimental/testing/vitest').vi
  const voidConfigMethods: [
    ReturnType<PublicVi['setConfig']> extends void ? true : false,
    ReturnType<PublicVi['resetConfig']> extends void ? true : false,
  ] = [true, true]
  expect(voidConfigMethods).toEqual([true, true])
  const mode = 'browser-runtime-config'
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_FAKE_TIMERS_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, `next-fake-timers-${mode}-`))
  const argv = [
    '--test-reporter=tap',
    join(__dirname, 'browser-fake-timers-integration.cjs'),
    mode,
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    const saved = await Promise.allSettled([
      fs.writeFile(join(evidence, 'stdout.log'), stdout),
      fs.writeFile(join(evidence, 'stderr.log'), stderr),
      fs.writeFile(
        join(evidence, 'original-child.json'),
        JSON.stringify(
          {
            pid: child.pid,
            argv: [process.execPath, ...argv],
            actualClose,
            stdoutClosed: child.stdout?.destroyed,
            stderrClosed: child.stderr?.destroyed,
            error: failure === undefined ? null : String(failure),
          },
          null,
          2
        )
      ),
    ])
    const errors = saved
      .filter((row): row is PromiseRejectedResult => row.status === 'rejected')
      .map((row) => row.reason)
    if (errors.length)
      throw new AggregateError(
        errors,
        'Could not retain fake-timer child output'
      )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 1')
    expect(stdout).toContain('# pass 1')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_FAKE_TIMERS_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

test('publishes one test context through actual Node and Browser callback platforms', async () => {
  const { mkdirSync, writeFileSync } = require('node:fs')
  for (const mode of ['node', 'browser']) {
    let stdout = ''
    let stderr = ''
    let failure: unknown
    try {
      ;({ stdout, stderr } = await promisify(execFile)(
        process.execPath,
        [
          join(__dirname, 'browser-context-identity.cjs'),
          mode,
          require.resolve('next/dist/experimental/testing/runner'),
        ],
        { timeout: 20_000 }
      ))
    } catch (error) {
      failure = error
      stdout = (error as { stdout?: string }).stdout ?? ''
      stderr = (error as { stderr?: string }).stderr ?? ''
    }
    const capture = process.env.NEXT_TESTING_BROWSER_CONTEXT_IDENTITY_EVIDENCE
    if (capture) {
      mkdirSync(capture, { recursive: true })
      writeFileSync(join(capture, mode + '.stdout'), stdout)
      writeFileSync(join(capture, mode + '.stderr'), stderr)
    }
    expect(stderr).toBe('')
    if (failure) throw failure
    const observed = JSON.parse(stdout.trim().split('\n').at(-1)!)
    expect(observed.mode).toBe(mode)
    expect(observed.groups).toHaveLength(3)
    expect(observed.identityRecords).toBe(8)
    expect(observed.cleaned).toBe(true)
  }
})

it('uses the actual Browser env backend for literal subjects and preserves Node process.env behavior', () => {
  const { spawnSync } =
    require('node:child_process') as typeof import('node:child_process')
  const { mkdirSync, writeFileSync } =
    require('node:fs') as typeof import('node:fs')
  for (const mode of ['node', 'browser']) {
    const args = [
      ...(mode === 'browser'
        ? ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning']
        : []),
      join(__dirname, 'browser-env-stubs.cjs'),
      mode,
    ]
    const result = spawnSync(process.execPath, args, {
      encoding: 'utf8',
      timeout: 20_000,
    })
    const capture = process.env.NEXT_TESTING_BROWSER_ENV_EVIDENCE
    if (capture) {
      mkdirSync(capture, { recursive: true })
      writeFileSync(join(capture, mode + '.stdout'), result.stdout ?? '')
      writeFileSync(join(capture, mode + '.stderr'), result.stderr ?? '')
      writeFileSync(
        join(capture, mode + '.json'),
        JSON.stringify({
          pid: result.pid,
          status: result.status,
          signal: result.signal,
          error: result.error?.message,
        })
      )
    }
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const observed = JSON.parse(result.stdout.trim().split('\n').at(-1)!)
    if (mode === 'browser') {
      expect(observed.rows).toEqual(
        require('./browser-env-stubs-pristine.json').rows
      )
      expect(observed.completed).toEqual(
        require('./browser-env-stubs-pristine.json').cases.map(
          (test: any) => test.fullName
        )
      )
      expect(observed.cleaned).toBe(true)
    } else
      expect(observed).toMatchObject({
        originalNodeStringConversion: true,
        restored: true,
      })
  }
}, 45000)

it('injects fixture values at registration with nullish fallback and lazy cleanup', async () => {
  const data = { label: 'provided' }
  const provided: Record<string, unknown> = {
    value: 'provided',
    zero: 0,
    disabled: false,
    empty: '',
    nullable: null,
    data,
    factory: data,
  }
  const reads: string[] = []
  const trace: string[] = []
  const c = createCollector('injected', {
    injectValue(name) {
      reads.push(name)
      return provided[name]
    },
  })
  const test = c.api.test.extend<{
    value: string
    zero: number
    disabled: boolean
    empty: string
    nullable: string
    missing: string
    data: typeof data
    factory: typeof data
    fallback: string
    derived: string
  }>({
    value: ['default', { injected: true }],
    zero: [99, { injected: true }],
    disabled: [true, { injected: true }],
    empty: ['default', { injected: true }],
    nullable: ['null-default', { injected: true }],
    missing: ['missing-default', { injected: true }],
    data: [{ label: 'default' }, { injected: true }],
    factory: [
      async ({}, provide) => {
        trace.push('provided factory ran')
        await provide(data)
      },
      { injected: true },
    ],
    fallback: [
      async ({}, provide) => {
        trace.push('setup')
        await provide('fallback')
        trace.push('cleanup')
      },
      { injected: true },
    ],
    derived: async ({ value, fallback }, provide) => {
      await provide(value + '/' + fallback)
    },
  })
  provided.value = 'changed after registration'
  test('consumer', ({
    value,
    zero,
    disabled,
    empty,
    nullable,
    missing,
    data: actual,
    factory,
    derived,
  }) => {
    expect({
      value,
      zero,
      disabled,
      empty,
      nullable,
      missing,
      derived,
    }).toEqual({
      value: 'provided',
      zero: 0,
      disabled: false,
      empty: '',
      nullable: 'null-default',
      missing: 'missing-default',
      derived: 'provided/fallback',
    })
    expect(actual).toBe(data)
    expect(factory).toBe(data)
    expect(trace).toEqual(['setup'])
  })
  c.api.afterAll(() => {
    expect(trace).toEqual(['setup', 'cleanup'])
  })
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual(['passed'])
  expect(result.errors).toEqual([])
  expect(reads).toEqual([
    'value',
    'zero',
    'disabled',
    'empty',
    'nullable',
    'missing',
    'data',
    'factory',
    'fallback',
  ])
})

it('preserves plain and explicit fixture overrides and typed injected builder options', async () => {
  const c = createCollector('injected-overrides', {
    injectValue: () => 'provided',
  })
  const base = c.api.test.extend<{ value: string }>({
    value: ['default', { injected: true }],
  })
  const plain = base.extend({ value: 'plain' })
  const enabled = base.extend({
    value: ['enabled-default', { injected: true }],
  })
  const disabled = base.extend({
    value: ['disabled-default', { injected: false }],
  })
  plain('plain', ({ value }) => {
    const exact: string = value
    expect(exact).toBe('plain')
  })
  enabled('enabled', ({ value }) => expect(value).toBe('provided'))
  disabled('disabled', ({ value }) => expect(value).toBe('disabled-default'))
  c.api.describe('override', () => {
    base.override('value', { injected: true }, 'override-default')
    base('explicit override', ({ value }) => expect(value).toBe('provided'))
  })
  c.api.describe('plain override', () => {
    base.override('value', 'plain-override')
    base('plain override', ({ value }) => expect(value).toBe('plain-override'))
  })
  const file = c.api.test.extend(
    'file',
    { scope: 'file', injected: true },
    'file-default'
  )
  file('file options', ({ file }) => {
    const exact: string = file
    expect(exact).toBe('provided')
  })
  if (false) {
    // @ts-expect-error injected is a boolean in the public fixture options.
    c.api.test.extend('invalid', { injected: 'yes' }, 1)
  }
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual(
    Array(6).fill('passed')
  )
  expect(result.errors).toEqual([])
})

it('collects tagged each and for tables with fixture context and stable public names', async () => {
  const collector = createCollector('tagged')
  const rows: unknown[] = []
  const { test, describe } = collector.api
  test.each`
    left | right | total
    ${1} | ${2}  | ${3}
    ${2} | ${5}  | ${7}
  `('adds $left and $right', ({ left, right, total }) => {
    expect(left + right).toBe(total)
    rows.push({ api: 'test.each', left, right, total })
  })
  const fixtureTest = test.extend<{ tone: string }>({ tone: 'fixture' })
  fixtureTest.for`label | value
    ${'alpha'} | ${3}
    ${'beta'} | ${6}
  `('$label is $value', { retry: 0 }, ({ label, value }, { tone, signal }) => {
    expect(signal.aborted).toBe(false)
    rows.push({ api: 'test.for', label, value, tone })
  })
  describe.each`
    label           | value
    ${'each-suite'} | ${9}
  `('$label', ({ label, value }) => {
    test('records the suite table row', () => {
      rows.push({ api: 'describe.each', label, value })
    })
  })
  describe.for`label | value
    ${'for-suite'} | ${12}
  `('$label', { retry: 0 }, ({ label, value }) => {
    test('records the for suite table row', () => {
      rows.push({ api: 'describe.for', label, value })
    })
  })
  const result = await run(collector)
  expect(result.cases.map(({ name, status }) => [name, status])).toEqual([
    ['adds 1 and 2', 'passed'],
    ['adds 2 and 5', 'passed'],
    ['alpha is 3', 'passed'],
    ['beta is 6', 'passed'],
    ['each-suite > records the suite table row', 'passed'],
    ['for-suite > records the for suite table row', 'passed'],
  ])
  expect(rows).toEqual([
    { api: 'test.each', left: 1, right: 2, total: 3 },
    { api: 'test.each', left: 2, right: 5, total: 7 },
    { api: 'test.for', label: 'alpha', value: 3, tone: 'fixture' },
    { api: 'test.for', label: 'beta', value: 6, tone: 'fixture' },
    { api: 'describe.each', label: 'each-suite', value: 9 },
    { api: 'describe.for', label: 'for-suite', value: 12 },
  ])
})

it('preserves object-prototype fixture names across extensions and dependencies', async () => {
  const c = createCollector('file')
  const events: unknown[] = []
  const named = c.api.test.extend<{
    toString: string
    constructor: { tag: string }
    hasOwnProperty: number
    __proto__: { count: number }
  }>({
    toString: 'text',
    constructor: { tag: 'base' },
    hasOwnProperty: 3,
    ['__proto__']: { count: 5 },
  })
  named(
    'static fixture names',
    ({ toString, constructor, hasOwnProperty, __proto__ }) => {
      expect([
        toString,
        constructor.tag,
        hasOwnProperty,
        __proto__.count,
      ]).toEqual(['text', 'base', 3, 5])
      events.push([
        'static',
        toString,
        constructor.tag,
        hasOwnProperty,
        __proto__.count,
      ])
    }
  )
  const factories = named
    .extend<{ toString: string }>({
      toString: async ({ toString, constructor }, provide) => {
        events.push(['factory+', toString, constructor.tag])
        await provide(`${toString}:${constructor.tag}`)
        events.push(['factory-'])
      },
    })
    .extend(
      'hasOwnProperty',
      async ({ __proto__, hasOwnProperty }, { onCleanup }) => {
        events.push(['builder+', __proto__.count, hasOwnProperty])
        onCleanup(() => {
          events.push(['builder-'])
        })
        return __proto__.count + hasOwnProperty
      }
    )
  factories('factory dependencies', ({ toString, hasOwnProperty }) => {
    expect([toString, hasOwnProperty]).toEqual(['text:base', 8])
    events.push(['factory body', toString, hasOwnProperty])
  })
  c.api.describe('suite override', () => {
    factories.override('constructor', { tag: 'nested' })
    factories.override('__proto__', { count: 7 })
    factories('overridden dependencies', ({ toString, hasOwnProperty }) => {
      expect([toString, hasOwnProperty]).toEqual(['text:nested', 10])
      events.push(['override body', toString, hasOwnProperty])
    })
  })
  factories('sibling dependencies', ({ toString, hasOwnProperty }) => {
    expect([toString, hasOwnProperty]).toEqual(['text:base', 8])
    events.push(['sibling body', toString, hasOwnProperty])
  })

  const result = await run(c)
  expect(result.errors).toEqual([])
  expect(result.cases.map((test) => test.status)).toEqual(
    Array(4).fill('passed')
  )
  expect(events).toEqual([
    ['static', 'text', 'base', 3, 5],
    ['factory+', 'text', 'base'],
    ['builder+', 5, 3],
    ['factory body', 'text:base', 8],
    ['builder-'],
    ['factory-'],
    ['factory+', 'text', 'nested'],
    ['builder+', 7, 3],
    ['override body', 'text:nested', 10],
    ['builder-'],
    ['factory-'],
    ['factory+', 'text', 'base'],
    ['builder+', 5, 3],
    ['sibling body', 'text:base', 8],
    ['builder-'],
    ['factory-'],
  ])
})

it.each(['case', 'suite'])(
  'retains enqueue-time asynchronous ancestry and FIFO slots for queued %s work',
  async (kind) => {
    const { getOriginatingHook, getOriginatingScopeAncestors } = await import(
      'next/dist/experimental/testing/runner/async-context'
    )
    const deferred = () => {
      let resolve!: () => void
      const promise = new Promise<void>((done) => {
        resolve = done
      })
      return { promise, resolve }
    }
    const leftEntered = deferred()
    const rightSetup = deferred()
    const rightEntered = deferred()
    const releaseLeft = deferred()
    const releaseRight = deferred()
    const c = createCollector('queued-owners')
    const hookIds = new Map<string, string>()
    const entries: string[] = []
    const origins: {
      name: string
      owner: string
      ancestors: readonly string[]
    }[] = []
    let leftCount = 0
    let rightCount = 0
    let active = 0
    let maximum = 0
    c.api.aroundAll(async (execute) => {
      hookIds.set('parent', getOriginatingHook()!.id)
      await execute()
    })
    const body = (name: string, owner: string) => async () => {
      entries.push(name)
      origins.push({ name, owner, ancestors: getOriginatingScopeAncestors() })
      active++
      maximum = Math.max(maximum, active)
      try {
        if (name.startsWith('left')) {
          if (++leftCount === 2) leftEntered.resolve()
          await releaseLeft.promise
        } else {
          if (++rightCount === 2) rightEntered.resolve()
          await releaseRight.promise
        }
      } finally {
        active--
      }
    }
    const suite = (name: string, cases: string[]) => {
      c.api.describe.concurrent(name, () => {
        c.api.aroundAll(async (execute) => {
          hookIds.set(name, getOriginatingHook()!.id)
          await execute()
        })
        if (kind === 'case' && name === 'right')
          c.api.beforeAll(async () => {
            await leftEntered.promise
            rightSetup.resolve()
          })
        for (const nameOfCase of cases)
          c.api.test.concurrent(nameOfCase, body(nameOfCase, name))
      })
    }
    if (kind === 'case') {
      suite('left', ['left first', 'left second'])
      suite('right', ['right first', 'right second'])
    } else {
      for (const name of [
        'left first',
        'left second',
        'right first',
        'right second',
      ])
        suite(name, [name])
    }
    const running = runCollected(
      c.close(),
      { ...options(), maxConcurrency: 2 },
      () => {}
    )
    try {
      await leftEntered.promise
      if (kind === 'case') await rightSetup.promise
      // Let the right declarations reach their occupied FIFO queue, rather
      // than relying on a wall-clock delay or on the release callback's owner.
      await new Promise<void>(setImmediate)
      expect(entries).toEqual(['left first', 'left second'])
      releaseLeft.resolve()
      await rightEntered.promise
      expect(entries).toEqual([
        'left first',
        'left second',
        'right first',
        'right second',
      ])
      expect(maximum).toBe(2)
      for (const origin of origins.filter(({ name }) =>
        name.startsWith('right')
      )) {
        expect(origin.ancestors).toContain(hookIds.get(origin.owner))
        expect(origin.ancestors).toContain(hookIds.get('parent'))
        for (const [name, id] of hookIds)
          if (name.startsWith('left'))
            expect(origin.ancestors).not.toContain(id)
      }
    } finally {
      releaseLeft.resolve()
      releaseRight.resolve()
      await running
    }
    const result = await running
    expect(result.errors).toEqual([])
    expect(result.cases.map(({ status }) => status)).toEqual([
      'passed',
      'passed',
      'passed',
      'passed',
    ])
    expect(active).toBe(0)
  }
)

it.each(['body', 'setup'])(
  'aborts only the attempt owning a %s deadline while retaining sibling cleanup and unopened-work fences',
  async (phase) => {
    const c = createCollector('timeout-owners')
    let releaseSibling!: () => void
    const timeoutObserved = new Promise<void>((resolve) => {
      releaseSibling = resolve
    })
    const healthySignals: boolean[] = []
    const ownSignals: boolean[] = []
    const fixtures: string[] = []
    const owned = c.api.test.extend({
      token: async ({ task }, provide) => {
        fixtures.push('start ' + task.name)
        await provide(task.id)
        fixtures.push('finish ' + task.name)
      },
    })
    const waitForAbort = (signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            releaseSibling()
            resolve()
          },
          { once: true }
        )
      })
    const observed = (name: string, signal: AbortSignal) => {
      if (name === 'healthy') healthySignals.push(signal.aborted)
      if (name === 'timeout') ownSignals.push(signal.aborted)
    }
    owned.aroundEach(async (execute, { task, token, signal }) => {
      expect(token).toBe(task.id)
      await execute()
      observed(task.name, signal)
    })
    owned.beforeEach(({ task, signal, onTestFinished }) => {
      onTestFinished(({ signal }) => observed(task.name, signal))
      if (phase === 'setup' && task.name === 'timeout')
        return waitForAbort(signal)
    }, 100)
    owned.afterEach(({ task, signal }) => observed(task.name, signal))
    owned.concurrent('timeout', { timeout: 100 }, async ({ signal }) => {
      if (phase !== 'body')
        throw new Error('a timed-out setup must not enter its body')
      await waitForAbort(signal)
    })
    owned.concurrent('healthy', async ({ signal }) => {
      await timeoutObserved
      healthySignals.push(signal.aborted)
    })
    owned('unopened tail', () => {})
    const result = await runCollected(
      c.close(),
      { ...options(), maxConcurrency: 2 },
      () => {}
    )
    expect(healthySignals).toEqual([false, false, false, false])
    expect(ownSignals).toEqual([true, true, true])
    expect(
      Object.fromEntries(result.cases.map(({ name, status }) => [name, status]))
    ).toEqual({
      timeout: 'failed',
      healthy: 'passed',
      'unopened tail': phase === 'body' ? 'passed' : 'cancelled',
    })
    expect(
      result.cases
        .find(({ name }) => name === 'timeout')!
        .errors.map(({ phase }) => phase)
    ).toEqual([phase === 'body' ? 'test' : 'beforeEach'])
    expect(result.cases.find(({ name }) => name === 'healthy')!.errors).toEqual(
      []
    )
    expect(
      fixtures.filter((event) => event.startsWith('start ')).sort()
    ).toEqual(
      fixtures
        .filter((event) => event.startsWith('finish '))
        .map((event) => event.replace('finish ', 'start '))
        .sort()
    )
    expect(result.interrupted).toBe(true)
  }
)

it.each(['explicit', 'runner', 'collection'] as const)(
  'reports the effective %s body timeout at its captured declaration while retaining settlement fences',
  async (source) => {
    const duration = { explicit: 5, runner: 7, collection: 9 }[source]
    const c = createCollector('body-timeout-origin', {
      getRuntimeConfig: () =>
        source === 'collection' ? { testTimeout: duration } : {},
    })
    const cleanup: string[] = []
    let taskKeys: string[] = []
    function registerTimedCase() {
      c.api.test(
        'deadline',
        source === 'explicit' ? { timeout: duration } : {},
        async ({ signal, task, onTestFinished }) => {
          taskKeys = Object.keys(task)
          onTestFinished(() => {
            cleanup.push('finished')
          })
          await new Promise<void>((resolve) =>
            signal.addEventListener(
              'abort',
              () => {
                cleanup.push('settled')
                resolve()
              },
              { once: true }
            )
          )
        }
      )
    }
    registerTimedCase()
    c.api.test('following', () => {
      cleanup.push('following')
    })
    const declaration = c.root.children[0]
    const descriptor = Object.getOwnPropertyDescriptor(
      declaration,
      'registrationError'
    )
    expect(descriptor).toMatchObject({ enumerable: false, writable: false })
    const result = await runCollected(
      c.close(),
      { ...options(), testTimeout: source === 'runner' ? duration : 100 },
      () => {}
    )
    expect(result.cases.map(({ status }) => status)).toEqual([
      'failed',
      'passed',
    ])
    expect(cleanup).toEqual(['settled', 'finished', 'following'])
    expect(result.interrupted).toBe(true)
    const error = result.cases[0].errors[0].error as Error
    const message = `Test timed out in ${duration}ms.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".`
    expect(error.name).toBe('Error')
    expect(error.message).toBe(message)
    expect(error.stack).toContain(`Error: ${message}\n`)
    expect(error.stack).toContain('registerTimedCase')
    expect(error.stack).not.toContain('Timeout.<anonymous>')
    expect(error).not.toHaveProperty('cause')
    expect(taskKeys).not.toContain('registrationError')
  }
)

it('preserves a non-body hook deadline diagnostic and unopened-work poisoning', async () => {
  const c = createCollector('hook-timeout-origin')
  const cleanup: string[] = []
  c.api.beforeEach(({ signal }) => {
    return new Promise<void>((resolve) =>
      signal.addEventListener(
        'abort',
        () => {
          cleanup.push('settled')
          resolve()
        },
        { once: true }
      )
    )
  }, 5)
  c.api.test('blocked', () => {
    throw new Error('a timed-out hook must not enter its body')
  })
  c.api.test('unopened', () => {})
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual([
    'failed',
    'cancelled',
  ])
  expect(cleanup).toEqual(['settled'])
  expect(result.interrupted).toBe(true)
  expect(result.cases[0].errors).toHaveLength(1)
  expect(result.cases[0].errors[0].phase).toBe('beforeEach')
  const error = result.cases[0].errors[0].error as Error
  expect(error.message).toBe(
    'Hook timed out in 5ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".'
  )
  expect(error.stack).toContain('next-testing-lifecycle.test.ts')
  expect(error.stack).not.toContain('Timeout.<anonymous>')
  expect(error).not.toHaveProperty('cause')
})

it('continues after real setup and teardown wrapper settlement with separate phase origins', async () => {
  const c = createCollector('around-phase-origins')
  const trace: string[] = []
  function registerWrapper() {
    c.api.aroundEach(async (execute, { task, signal }) => {
      if (task.name === 'following') {
        await execute()
        return
      }
      const expired = new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true })
      )
      if (task.name === 'teardown') await execute()
      await expired
      trace.push('settled ' + task.name)
    }, 5)
  }
  registerWrapper()
  c.api.test('setup', () => {
    throw new Error('timed-out setup must not invoke body')
  })
  c.api.test('teardown', () => {
    trace.push('body teardown')
  })
  c.api.test('following', () => {
    trace.push('following')
  })
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual([
    'failed',
    'failed',
    'passed',
  ])
  expect(trace).toEqual([
    'settled setup',
    'body teardown',
    'settled teardown',
    'following',
  ])
  expect(result.interrupted).toBe(true)
  for (const [index, phase] of ['setup', 'teardown'].entries()) {
    const error = result.cases[index].errors[0].error as Error
    const message = `The ${phase} phase of "aroundEach" hook timed out after 5ms.`
    expect(error.name).toBe(
      phase === 'setup' ? 'AroundHookSetupError' : 'AroundHookTeardownError'
    )
    expect(error.message).toBe(message)
    expect(error.stack).toContain(`Error: ${message}\n`)
    expect(error.stack).toContain('registerWrapper')
    expect(error.stack).not.toContain('Timeout.<anonymous>')
  }
})

it('preserves a healthy concurrent sibling and following work after wrapper cleanup', async () => {
  const c = createCollector('around-concurrent-settlement')
  let releaseSibling!: () => void
  const expired = new Promise<void>((resolve) => {
    releaseSibling = resolve
  })
  const trace: string[] = []
  const signals: boolean[] = []
  c.api.aroundEach(async (execute, { task, signal }) => {
    if (task.name === 'timeout') {
      signal.addEventListener('abort', releaseSibling, { once: true })
      await execute()
      await expired
      trace.push('wrapper settled')
    } else {
      await execute()
      signals.push(signal.aborted)
    }
  }, 10)
  c.api.test.concurrent('timeout', ({ onTestFinished }) => {
    onTestFinished(() => {
      trace.push('finished before timeout')
    })
  })
  c.api.test.concurrent('healthy', async ({ signal }) => {
    await expired
    signals.push(signal.aborted)
  })
  c.api.test('following', () => {
    trace.push('following')
  })
  const result = await runCollected(
    c.close(),
    { ...options(), maxConcurrency: 2 },
    () => {}
  )
  expect(result.cases.map(({ name, status }) => [name, status]).sort()).toEqual(
    [
      ['timeout', 'failed'],
      ['healthy', 'passed'],
      ['following', 'passed'],
    ].sort()
  )
  expect(trace).toEqual([
    'finished before timeout',
    'wrapper settled',
    'following',
  ])
  expect(signals).toEqual([false, false, false])
  expect(result.interrupted).toBe(true)
})

it.each(['setup', 'teardown'] as const)(
  'retains unopened-work poisoning until the actual %s wrapper settles',
  async (phase) => {
    const c = createCollector('around-pending-settlement')
    let release!: () => void
    let completed!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const finished = new Promise<void>((resolve) => {
      completed = resolve
    })
    c.api.aroundEach(async (execute) => {
      try {
        if (phase === 'teardown') await execute()
        await pending
      } finally {
        completed()
      }
    }, 5)
    c.api.test('timeout', () => {
      if (phase === 'setup') throw new Error('must not enter setup body')
    })
    c.api.test('following', () => {
      throw new Error('must not start before wrapper settlement')
    })
    try {
      const result = await run(c)
      expect(result.cases.map(({ status }) => status)).toEqual([
        'failed',
        'cancelled',
      ])
      expect(result.interrupted).toBe(true)
    } finally {
      release()
      await finished
    }
  }
)

it.each(['retry', 'repeat'] as const)(
  'admits a %s only after its own timed-out body, teardown and onCaseEnd close',
  async (kind) => {
    const c = createCollector('body-deadline-continuation')
    const trace: string[] = []
    const contexts: unknown[] = []
    const signals: AbortSignal[] = []
    let firstEnded!: () => void
    const ended = new Promise<void>((resolve) => {
      firstEnded = resolve
    })
    let releaseEnd!: () => void
    const closed = new Promise<void>((resolve) => {
      releaseEnd = resolve
    })
    c.api.test(
      'same case',
      { timeout: 5, ...(kind === 'retry' ? { retry: 1 } : { repeats: 1 }) },
      async (context) => {
        const { task, signal, onTestFailed, onTestFinished } = context
        contexts.push(context)
        signals.push(signal)
        const attempt =
          kind === 'retry' ? task.result!.retryCount : task.result!.repeatCount
        trace.push('body ' + attempt)
        onTestFinished(() => {
          trace.push('finished ' + attempt)
        })
        if (attempt === 0) {
          await new Promise<void>((resolve) => {
            onTestFailed(() => {
              trace.push('failed 0')
              resolve()
            })
          })
          trace.push('settled 0')
        } else {
          expect(signal.aborted).toBe(true)
          context.onTestFinished(() => {
            trace.push('shared context finished 1')
          })
        }
      }
    )
    c.api.test('following', () => {
      trace.push('following')
    })
    let first = true
    const running = runCollected(
      c.close(),
      {
        ...options(),
        async onCaseEnd(result) {
          if (result.name !== 'same case' || !first) return
          first = false
          trace.push('onCaseEnd 0')
          firstEnded()
          await closed
          trace.push('closed onCaseEnd 0')
        },
      },
      () => {}
    )
    try {
      await ended
      expect(trace).toEqual([
        'body 0',
        'finished 0',
        'failed 0',
        'settled 0',
        'onCaseEnd 0',
      ])
    } finally {
      releaseEnd()
    }
    const result = await running
    expect(result.cases.map(({ status }) => status)).toEqual([
      'failed',
      'passed',
      'passed',
    ])
    expect(trace).toEqual([
      'body 0',
      'finished 0',
      'failed 0',
      'settled 0',
      'onCaseEnd 0',
      'closed onCaseEnd 0',
      'body 1',
      'shared context finished 1',
      'finished 1',
      'following',
    ])
    expect(new Set(contexts).size).toBe(1)
    expect(new Set(signals).size).toBe(1)
    expect(result.interrupted).toBe(kind === 'repeat')
  }
)

it('retains each new body deadline and its actual settlement across repeated timeouts', async () => {
  const c = createCollector('repeated-body-deadlines')
  const trace: string[] = []
  c.api.test('twice', { timeout: 5, repeats: 1 }, async (context) => {
    const attempt = context.task.result!.repeatCount
    trace.push('body ' + attempt)
    await new Promise<void>((resolve) => {
      context.onTestFailed(() => {
        trace.push('failed ' + attempt)
        resolve()
      })
    })
    trace.push('settled ' + attempt)
  })
  c.api.test('following', () => {
    trace.push('following')
  })
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual([
    'failed',
    'failed',
    'passed',
  ])
  expect(trace).toEqual([
    'body 0',
    'failed 0',
    'settled 0',
    'body 1',
    'failed 1',
    'settled 1',
    'following',
  ])
  for (const attempt of result.cases.slice(0, 2)) {
    expect(attempt.errors).toHaveLength(1)
    expect((attempt.errors[0].error as Error).message).toBe(
      'Test timed out in 5ms.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".'
    )
  }
  expect(result.interrupted).toBe(true)
})

it('does not excuse a foreign unsettled deadline when admitting a retry', async () => {
  const c = createCollector('foreign-body-deadline')
  let releaseForeign!: () => void
  const pending = new Promise<void>((resolve) => {
    releaseForeign = resolve
  })
  let ownBodies = 0
  c.api.test.concurrent('foreign', { timeout: 5 }, async () => {
    await pending
  })
  c.api.test.concurrent(
    'own',
    { timeout: 10, retry: 1 },
    async ({ onTestFailed }) => {
      ownBodies++
      await new Promise<void>((resolve) => {
        onTestFailed(() => resolve())
      })
    }
  )
  c.api.test('following', () => {
    throw new Error('foreign pending work must retain the poison')
  })
  try {
    const result = await runCollected(
      c.close(),
      { ...options(), maxConcurrency: 2 },
      () => {}
    )
    expect(ownBodies).toBe(1)
    expect(
      result.cases.map(({ name, status }) => [name, status]).sort()
    ).toEqual(
      [
        ['foreign', 'failed'],
        ['own', 'failed'],
        ['following', 'cancelled'],
      ].sort()
    )
    expect(result.interrupted).toBe(true)
  } finally {
    releaseForeign()
    await pending
  }
})

it('keeps run cancellation dominant after an otherwise settled body deadline', async () => {
  const c = createCollector('cancel-body-retry')
  const controller = new AbortController()
  let bodies = 0
  c.api.test('timeout', { timeout: 5, retry: 1 }, async ({ onTestFailed }) => {
    bodies++
    await new Promise<void>((resolve) => {
      onTestFailed(() => resolve())
    })
  })
  c.api.test('following', () => {
    throw new Error('cancelled work must not execute')
  })
  const result = await runCollected(
    c.close(),
    {
      ...options(),
      signal: controller.signal,
      onCaseEnd(result) {
        if (result.name === 'timeout') controller.abort(new Error('cancel'))
      },
    },
    () => {}
  )
  expect(bodies).toBe(1)
  expect(result.cases.map(({ status }) => status)).toEqual([
    'failed',
    'cancelled',
  ])
  expect(result.interrupted).toBe(true)
})

it('does not admit a retry through the foreign around-timer capture window', async () => {
  const c = createCollector('foreign-around-admission')
  let releaseForeign!: () => void
  const pending = new Promise<void>((resolve) => {
    releaseForeign = resolve
  })
  let aroundExpired!: () => void
  const expired = new Promise<void>((resolve) => {
    aroundExpired = resolve
  })
  let ownBodies = 0
  c.api.aroundEach(async (execute, { task, signal }) => {
    if (task.name === 'foreign')
      signal.addEventListener('abort', aroundExpired, { once: true })
    await execute()
    if (task.name === 'foreign') await pending
  }, 10)
  c.api.test.concurrent('foreign', () => {})
  c.api.test.concurrent(
    'own',
    { timeout: 5, retry: 1 },
    async ({ onTestFailed }) => {
      ownBodies++
      await new Promise<void>((resolve) => {
        onTestFailed(() => resolve())
      })
    }
  )
  c.api.test('following', () => {
    throw new Error('a foreign around deadline must block unopened work')
  })
  try {
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        maxConcurrency: 2,
        async onCaseEnd(result) {
          if (result.name === 'own') await expired
        },
      },
      () => {}
    )
    expect(ownBodies).toBe(1)
    expect(result.cases.filter(({ name }) => name === 'own')).toHaveLength(1)
    expect(result.cases.find(({ name }) => name === 'following')!.status).toBe(
      'cancelled'
    )
    expect(result.interrupted).toBe(true)
  } finally {
    releaseForeign()
    await pending
  }
})

it('keeps a settled expected-failure timeout from borrowing another case retry recovery', async () => {
  const c = createCollector('foreign-expected-deadline')
  c.api.test.fails(
    'expected timeout',
    { timeout: 5 },
    async ({ onTestFailed }) => {
      await new Promise<void>((resolve) => onTestFailed(() => resolve()))
    }
  )
  let bodies = 0
  c.api.test(
    'recovered retry',
    { timeout: 5, retry: 1 },
    async ({ onTestFailed }) => {
      if (bodies++ === 0)
        await new Promise<void>((resolve) => onTestFailed(() => resolve()))
    }
  )
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual([
    'passed',
    'failed',
    'passed',
  ])
  expect(result.interrupted).toBe(false)
})

it('does not release a non-body historical deadline after another successful body retry', async () => {
  const c = createCollector('foreign-around-expected-deadline')
  c.api.aroundEach(async (execute, { signal, task }) => {
    await execute()
    if (task.name === 'expected wrapper timeout') {
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true })
      )
    }
  }, 5)
  c.api.test.fails('expected wrapper timeout', () => {})
  let bodies = 0
  c.api.test(
    'recovered retry',
    { timeout: 5, retry: 1 },
    async ({ onTestFailed }) => {
      if (bodies++ === 0)
        await new Promise<void>((resolve) => onTestFailed(() => resolve()))
    }
  )
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual([
    'passed',
    'failed',
    'passed',
  ])
  expect(result.interrupted).toBe(true)
})

it('keeps file cleanup errors dominant after successful body retry recovery', async () => {
  const c = createCollector('body-retry-file-cleanup')
  let bodies = 0
  c.api.afterAll(() => {
    throw new Error('file cleanup failure')
  })
  c.api.test(
    'recovered',
    { timeout: 5, retry: 1 },
    async ({ onTestFailed }) => {
      if (bodies++ === 0)
        await new Promise<void>((resolve) => onTestFailed(() => resolve()))
    }
  )
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual(['failed', 'passed'])
  expect(result.errors.map(({ error }) => (error as Error).message)).toEqual([
    'file cleanup failure',
  ])
  expect(result.interrupted).toBe(true)
})

it('does not let an expected timeout borrow a successful retry of a later repeat of the same case', async () => {
  const c = createCollector('same-case-expected-body-deadline')
  let bodies = 0
  const events: unknown[] = []
  c.api.test.fails(
    'expected repeats',
    { timeout: 5, retry: 1, repeats: 1 },
    async ({ signal, task }) => {
      const current = bodies++
      events.push([
        'body',
        current,
        task.result!.retryCount,
        task.result!.repeatCount,
        signal.aborted,
      ])
      if (current === 0) {
        await new Promise<void>((resolve) =>
          signal.addEventListener(
            'abort',
            () => {
              events.push(['abort', current])
              resolve()
            },
            { once: true }
          )
        )
        events.push(['settled', current, signal.aborted])
      } else if (current === 2) throw new Error('expected final retry failure')
    }
  )
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual([
    'passed',
    'failed',
    'passed',
  ])
  expect(events).toEqual([
    ['body', 0, 0, 0, false],
    ['abort', 0],
    ['settled', 0, true],
    ['body', 1, 0, 1, true],
    ['body', 2, 1, 1, true],
  ])
  expect((result.cases[1].errors[0].error as Error).message).toBe(
    'Expect test to fail'
  )
  expect(result.interrupted).toBe(false)
})

it('carries only actual body deadline registrations privately without changing Error own fields', async () => {
  const c = createCollector('private-body-registration')
  c.api.test(
    'deadline',
    { timeout: 5 },
    ({ signal }) =>
      new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true })
      )
  )
  const declaration = c.root.children[0]
  const registration = Object.getOwnPropertyDescriptor(
    declaration,
    'registrationError'
  )!.value
  const result = await run(c)
  const failure = result.cases[0].errors[0]
  const error = failure.error as Error
  expect(failure.registrationError).toBe(registration)
  expect(
    Object.getOwnPropertyDescriptor(failure, 'registrationError')
  ).toMatchObject({ enumerable: false, writable: false })
  expect(Object.keys(failure)).toEqual(['phase', 'error'])
  expect({ ...failure }).not.toHaveProperty('registrationError')
  expect(error).not.toHaveProperty('registrationError')
  expect(Object.getOwnPropertyNames(error).sort()).toEqual(
    ['message', 'operation', 'stack'].sort()
  )
  expect(error.stack).toBe(registration.stack)

  const user = createCollector('user-error-registration')
  const actual = new Error('ordinary error')
  user.api.test('user', () => {
    throw actual
  })
  const before = Object.getOwnPropertyDescriptors(actual)
  const failed = (await run(user)).cases[0].errors[0]
  expect(failed.error).toBe(actual)
  expect(failed).not.toHaveProperty('registrationError')
  expect(Object.getOwnPropertyDescriptors(actual)).toEqual(before)
  const hook = createCollector('hook-registration')
  hook.api.beforeEach(
    ({ signal }) =>
      new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true })
      ),
    5
  )
  hook.api.test('blocked', () => {
    throw new Error('must not enter')
  })
  const hookFailure = (await run(hook)).cases[0].errors[0]
  expect(hookFailure.phase).toBe('beforeEach')
  expect(hookFailure.registrationError).toBe(hookFailure.error)
  expect(
    Object.getOwnPropertyDescriptor(hookFailure, 'registrationError')
  ).toMatchObject({ enumerable: false, writable: false })
  expect(hookFailure.error).not.toHaveProperty('registrationError')
})

it('uses actual fixture-builder receivers and fresh default modifiers while preserving override suite scope', async () => {
  const c = createCollector('fixture-receivers')
  const events: unknown[] = []
  const own = c.api.test.extend('base', 'own')
  const other = c.api.test.extend('base', 'other')
  const same = Reflect.apply(own.extend, own, ['value', 'same'])
  same('same', ({ base, value }) => events.push(['same', base, value]))
  const foreign = Reflect.apply(own.extend, other, ['value', 'foreign'])
  foreign('foreign', ({ base, value }) => events.push(['foreign', base, value]))
  own.skip.extend('value', 'fresh')('direct skip', ({ base, value }) =>
    events.push(['direct skip', base, value])
  )
  const borrowedSkip = Reflect.apply(own.skip.extend, other, [
    'value',
    'borrowed',
  ])
  borrowedSkip('borrowed skip', ({ base, value }) =>
    events.push(['borrowed skip', base, value])
  )
  own.concurrent.extend('value', 'serial')(
    'fresh concurrency',
    ({ base, task }) =>
      events.push(['fresh concurrency', base, task.concurrent])
  )
  c.api.describe('override', () => {
    const returned = Reflect.apply(own.override, other, ['base', 'changed'])
    expect(returned).toBe(other)
    own('unchanged own', ({ base }) => events.push(['own', base]))
    other('changed other', ({ base }) => events.push(['other', base]))
  })
  own('outside', ({ base }) => events.push(['outside', base]))
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual(
    Array(8).fill('passed')
  )
  expect(events).toEqual([
    ['same', 'own', 'same'],
    ['foreign', 'other', 'foreign'],
    ['direct skip', 'own', 'fresh'],
    ['borrowed skip', 'other', 'borrowed'],
    ['fresh concurrency', 'own', undefined],
    ['own', 'own'],
    ['other', 'changed'],
    ['outside', 'own'],
  ])
})

it('retains actual unbound fixture operation refusals without adding public API properties', () => {
  const c = createCollector('unbound-fixture-receivers')
  const api = c.api.test.extend('value', 1)
  const keys = Reflect.ownKeys(api)
  for (const operation of [api.extend, api.override]) {
    expect(() => Reflect.apply(operation, undefined, ['value', 2])).toThrow(
      "Cannot read properties of undefined (reading 'getFixtures')"
    )
  }
  expect(Reflect.ownKeys(api)).toEqual(keys)
  expect(Object.getOwnPropertySymbols(api)).toEqual([])
  c.close()
})

it('dispatches cached receiver fixtures to the current collector while rejecting a closed async origin first', async () => {
  let active: ReturnType<typeof createCollector> | undefined
  const first = createCollector('cached-fixtures', {
    getActiveCollector: () => active,
  })
  const original = first.api.test.extend('base', 'original')
  const receiver = first.api.test.extend('base', 'receiver')
  const extend = original.extend
  const override = original.override
  first.close()
  const next = createCollector('current-fixtures')
  active = next
  const events: unknown[] = []
  const fresh = Reflect.apply(extend, receiver, ['value', 'current'])
  fresh('redirected', ({ base, value }) => events.push([base, value]))
  expect(Reflect.apply(override, receiver, ['base', 'overridden'])).toBe(
    receiver
  )
  receiver('redirected override', ({ base }) => events.push([base]))

  const late: Error[] = []
  const scope = createAsyncScope(
    { kind: 'collection', context: { id: 'old', name: 'old' } },
    (error) => late.push(error)
  )
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const reads: PropertyKey[] = []
  const observedReceiver = new Proxy(receiver, {
    get(target, key, actualReceiver) {
      reads.push(key)
      return Reflect.get(target, key, actualReceiver)
    },
  })
  const pending = scope.run(() =>
    gate.then(() => Reflect.apply(extend, observedReceiver, ['late', true]))
  )
  scope.close()
  release()
  await expect(pending).rejects.toThrow('closed collection scope "old"')
  expect(reads).toEqual([])
  expect(late).toHaveLength(1)
  const result = await run(next)
  expect(result.cases.map(({ status }) => status)).toEqual(['passed', 'passed'])
  expect(events).toEqual([['receiver', 'current'], ['overridden']])
})

it('recognizes options-only fixture builders while retaining ordinary values and actual omitted arguments', async () => {
  const c = createCollector('options-only-builders')
  const events: unknown[] = []
  for (const [name, args] of [
    ['file', [{ scope: 'file' }]],
    ['worker', [{ scope: 'worker' }]],
    ['mixed', [{ auto: false, extra: 3 }]],
    ['explicit undefined', [{ scope: 'test' }, undefined]],
    ['empty undefined', [{}, undefined]],
    ['omitted', []],
    ['object', [{ port: 3 }]],
    ['array', [['one', 'two']]],
  ] as const) {
    const api = Reflect.apply(c.api.test.extend, c.api.test, ['value', ...args])
    api(name, ({ value }) => {
      events.push([
        name,
        value && typeof value === 'object' ? Object.keys(value) : value,
      ])
    })
  }
  const overridden = c.api.test.extend('value', () => ({ initial: true }))
  c.api.describe('override', () => {
    Reflect.apply(overridden.override, overridden, ['value', { auto: false }])
    overridden('options-only override', ({ value }) => {
      events.push(['override', Object.keys(value)])
    })
  })
  const result = await run(c)
  expect(result.cases.map(({ status }) => status)).toEqual(
    Array(9).fill('passed')
  )
  expect(events).toEqual([
    ['file', []],
    ['worker', []],
    ['mixed', []],
    ['explicit undefined', []],
    ['empty undefined', []],
    ['omitted', undefined],
    ['object', ['port']],
    ['array', ['0', '1']],
    ['override', []],
  ])
})

it('captures options-only proxy fields in the target registration order without consuming ordinary object values', () => {
  const c = createCollector('options-only-reads')
  const events: unknown[] = []
  const selected = new Proxy(
    { auto: false, scope: 'test', injected: false, ignored: true },
    {
      ownKeys(target) {
        events.push('keys')
        return Reflect.ownKeys(target)
      },
      getOwnPropertyDescriptor(target, key) {
        events.push(['descriptor', key])
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
      get(target, key, receiver) {
        events.push(['get', key])
        return Reflect.get(target, key, receiver)
      },
    }
  )
  c.api.test.extend('value', selected)
  expect(events).toEqual([
    'keys',
    ['descriptor', 'auto'],
    ['descriptor', 'scope'],
    ['descriptor', 'injected'],
    ['descriptor', 'ignored'],
    'keys',
    ['descriptor', 'auto'],
    ['descriptor', 'scope'],
    ['descriptor', 'injected'],
    ['descriptor', 'ignored'],
    ['get', 'auto'],
    ['get', 'scope'],
    ['get', 'injected'],
  ])
  events.length = 0
  const ordinary = new Proxy(
    { port: 3 },
    {
      ownKeys(target) {
        events.push('ordinary keys')
        return Reflect.ownKeys(target)
      },
    }
  )
  c.api.test.extend('value', ordinary)
  expect(events).toEqual(['ordinary keys'])
  c.close()
})

it('accounts for a settled expected body deadline only after its own cleanup and completion', async () => {
  const c = createCollector('expected-body-publication')
  const events: string[] = []
  const owned = c.api.test.extend<{ resource: string }>({
    resource: async ({}, provide) => {
      events.push('fixture setup')
      await provide('live')
      events.push('fixture cleanup')
    },
  })
  owned.fails(
    'expected settled deadline',
    { timeout: 5 },
    async ({ resource, signal, onTestFinished, onTestFailed }) => {
      events.push(resource)
      onTestFinished(() => {
        events.push('finished')
      })
      onTestFailed(() => {
        events.push('failed')
      })
      await new Promise<void>((resolve) =>
        signal.addEventListener(
          'abort',
          () => {
            events.push('abort')
            resolve()
          },
          { once: true }
        )
      )
      events.push('body settled')
    }
  )
  c.api.test('following', ({ signal }) => {
    events.push(signal.aborted ? 'following aborted' : 'following live')
  })
  const result = await runCollected(
    c.close(),
    {
      ...options(),
      onCaseEnd: (row) => {
        events.push(`case end ${row.name}`)
      },
    },
    () => {}
  )
  expect(result.cases.map(({ status }) => status)).toEqual(['passed', 'passed'])
  expect(events).toEqual([
    'fixture setup',
    'live',
    'abort',
    'body settled',
    'fixture cleanup',
    'finished',
    'failed',
    'case end expected settled deadline',
    'following live',
    'case end following',
  ])
  expect(result.errors).toEqual([])
  expect(result.interrupted).toBe(false)
})

it('retains cancellation from the completion callback after a settled expected body deadline', async () => {
  const c = createCollector('expected-body-completion-cancel')
  const controller = new AbortController()
  c.api.test.fails(
    'expected settled deadline',
    { timeout: 5 },
    async ({ signal }) => {
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true })
      )
    }
  )
  const result = await runCollected(
    c.close(),
    {
      ...options(),
      signal: controller.signal,
      onCaseEnd: () => {
        controller.abort(new Error('cancel at completion'))
      },
    },
    () => {}
  )
  expect(result.cases.map(({ status }) => status)).toEqual(['passed'])
  expect(result.errors).toEqual([])
  expect(result.interrupted).toBe(true)
})

it('publishes one actual logical-case result after retry/repeat cleanup and before later work', async () => {
  const c = createCollector('logical-case-results')
  const trace: string[] = []
  const seen: Task[] = []
  let tries = 0
  let repetitions = 0
  let actualTask: Task | undefined
  c.api.afterEach(({ task }) => {
    trace.push(`after:${task.name}`)
  })
  c.api.test('retry', { retry: 1 }, ({ task, onTestFinished }) => {
    actualTask ??= task
    expect(task).toBe(actualTask)
    onTestFinished(() => {
      Object.assign(task.meta, { closed: true })
      trace.push(`finished:${++tries}`)
    })
    if (tries === 0) throw new Error('first retry failure')
  })
  c.api.test('repeat failure', { repeats: 1 }, () => {
    if (repetitions++ === 0) throw new Error('first repeat failure')
  })
  c.api.test.skip('static skip', () => {
    throw new Error('must remain skipped')
  })
  c.api.test.todo('todo')
  c.api.test('runtime skip', { retry: 2, repeats: 2 }, ({ skip }) => {
    skip('actual skip')
  })
  c.api.test('following', () => {
    trace.push('following')
  })
  const observations: unknown[] = []
  const result = await runCollected(
    c.close(),
    {
      ...options(),
      onCaseEnd(value) {
        trace.push(
          `attempt:${value.name}:${value.attempt.retry}:${value.attempt.repeat}`
        )
      },
      async onCaseResult(task, value) {
        seen.push(task)
        observations.push([task.name, value.status, value.pending ?? false])
        if (task.name === 'retry') {
          expect(task).toBe(actualTask)
          expect(task.meta).toHaveProperty('closed', true)
          expect(task.file.tasks).toHaveLength(6)
          expect(task.file.tasks[5].name).toBe('following')
          expect(trace).not.toContain('following')
          expect(trace.slice(0, 6)).toEqual([
            'after:retry',
            'finished:1',
            'attempt:retry:0:0',
            'after:retry',
            'finished:2',
            'attempt:retry:1:0',
          ])
        }
        await Promise.resolve()
        trace.push(`logical:${task.name}`)
      },
    },
    () => {}
  )
  expect(observations).toEqual([
    ['retry', 'passed', false],
    ['repeat failure', 'failed', false],
    ['static skip', 'skipped', false],
    ['todo', 'skipped', false],
    ['runtime skip', 'skipped', true],
    ['following', 'passed', false],
  ])
  expect(new Set(seen).size).toBe(6)
  expect(result.cases).toHaveLength(8)
  expect(trace.indexOf('logical:runtime skip')).toBeLessThan(
    trace.indexOf('following')
  )
  expect(
    result.cases.find((value) => value.name === 'repeat failure')!.errors[0]
      .error
  ).toMatchObject({ message: 'first repeat failure' })
})

it('awaits the actual logical result producer before admitting the next case', async () => {
  const c = createCollector('logical-case-barrier')
  const trace: string[] = []
  let entered!: () => void
  const callbackEntered = new Promise<void>((resolve) => {
    entered = resolve
  })
  let release!: () => void
  const callbackReleased = new Promise<void>((resolve) => {
    release = resolve
  })
  c.api.test('first', () => {
    trace.push('first')
  })
  c.api.test('following', () => {
    trace.push('following')
  })
  const running = runCollected(
    c.close(),
    {
      ...options(),
      async onCaseResult(task) {
        trace.push(`result:${task.name}`)
        if (task.name === 'first') {
          entered()
          await callbackReleased
        }
      },
    },
    () => {}
  )
  await callbackEntered
  try {
    expect(trace).toEqual(['first', 'result:first'])
  } finally {
    release()
  }
  const result = await running
  expect(trace).toEqual([
    'first',
    'result:first',
    'following',
    'result:following',
  ])
  expect(result.cases.map((value) => value.status)).toEqual([
    'passed',
    'passed',
  ])
})

it('qualifies completed failed-body snapshot ownership in a fresh process', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'failed-body-snapshots.ts'),
  ]).catch((error) => {
    throw new Error([error.message, error.stdout, error.stderr].join('\n'))
  })
  expect(stdout).toContain('# tests 3')
  expect(stdout).toContain('# fail 0')
}, 30000)

it('qualifies deferred body assertion snapshot ownership in a fresh process', async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      '--test-reporter=tap',
      '--import',
      require.resolve('tsx'),
      join(__dirname, 'failed-body-snapshots.ts'),
    ],
    { env: { ...process.env, NEXT_TEST_DEFERRED_SNAPSHOT_CONTRACT: '1' } }
  ).catch((error) => {
    throw new Error([error.message, error.stdout, error.stderr].join('\n'))
  })
  expect(stdout).toContain('# tests 6')
  expect(stdout).toContain('# fail 0')
}, 30000)

it('retains operation phase ancestry and the original closed-owner fence', async () => {
  const { runWithCasePhase, getOriginatingCasePhase, captureAsyncScope } =
    await import('next/dist/experimental/testing/runner/async-context')
  const failures: Error[] = []
  const owner = createAsyncScope(
    { kind: 'collection', context: { id: 'collection', name: 'collection' } },
    (error) => failures.push(error)
  )
  let captured: ReturnType<typeof captureAsyncScope> | undefined
  const c = createCollector('phase-ancestry')
  const phases: unknown[] = []
  c.api.test('body', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const setup = runWithCasePhase('beforeEach', async () => {
      await gate
      return getOriginatingCasePhase()
    })
    await runWithCasePhase('test', async () => {
      const actual = getOriginatingCasePhase()
      phases.push(actual?.phase)
      captured = captureAsyncScope()
      release()
      phases.push((await setup)?.phase)
      phases.push(getOriginatingCasePhase()?.phase)
    })
  })
  await owner.run(() =>
    runCollected(
      c.close(),
      { ...options(), onLateFailure: (error) => failures.push(error) },
      () => {}
    )
  )
  owner.close()
  expect(phases).toEqual(['test', 'beforeEach', 'test'])
  expect(() => captured!.run(() => {})).toThrow('closed attempt scope')
  expect(failures).toHaveLength(1)
})

it.each(['stack', 'list', 'parallel'] as const)(
  'calls actual returned beforeEach functions once with no receiver or supplied arguments: %s',
  async (sequence) => {
    const c = createCollector('returned-cleanup-call')
    const rows: unknown[] = []
    const roles: unknown[] = []
    const boundReceiver = { bound: true }
    const lexicalReceiver = { lexical: true }
    const record = (name: string, receiver: unknown, args: unknown[]) => {
      rows.push([name, receiver, args])
    }
    const makeArrow = function (this: unknown) {
      return (...args: unknown[]) => {
        record('arrow', this === lexicalReceiver, args)
      }
    }
    const factories: [string, () => Function][] = [
      [
        'normal',
        () =>
          function (this: unknown, ...args: unknown[]) {
            record('normal', this === undefined, args)
          },
      ],
      [
        'proxy',
        () =>
          new Proxy(
            function (this: unknown, ...args: unknown[]) {
              record('proxy', this === undefined, args)
            },
            {
              apply(target, receiver, args) {
                record('apply', receiver === undefined, args)
                return Reflect.apply(target, receiver, args)
              },
            }
          ),
      ],
      [
        'bound',
        () =>
          function (this: unknown, ...args: unknown[]) {
            record('bound', this === boundReceiver, args)
          }.bind(boundReceiver, 'bound argument'),
      ],
      ['arrow', () => makeArrow.call(lexicalReceiver)],
      [
        'async',
        () =>
          async function (this: unknown, ...args: unknown[]) {
            await Promise.resolve()
            record('async', this === undefined, args)
          },
      ],
      [
        'default',
        () =>
          function (this: unknown, value = 'default') {
            rows.push(['default', this === undefined, arguments.length, value])
          },
      ],
    ]
    for (const [name, make] of factories) {
      c.api.describe(name, () => {
        c.api.beforeEach(() => {
          rows.push(['before', name])
          return make()
        })
        c.api.test('body', () => {
          rows.push(['body', name])
        })
      })
    }
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        sequence: { hooks: sequence },
        runWithCasePhase(phase, callback, authoredCallback) {
          if (phase === 'cleanup') roles.push([phase, authoredCallback])
          return callback()
        },
      },
      () => {}
    )
    expect(result.cases.map(({ status }) => status)).toEqual(
      Array(6).fill('passed')
    )
    expect(result.errors).toEqual([])
    expect(rows).toEqual([
      ['before', 'normal'],
      ['body', 'normal'],
      ['normal', true, []],
      ['before', 'proxy'],
      ['body', 'proxy'],
      ['apply', true, []],
      ['proxy', true, []],
      ['before', 'bound'],
      ['body', 'bound'],
      ['bound', true, ['bound argument']],
      ['before', 'arrow'],
      ['body', 'arrow'],
      ['arrow', true, []],
      ['before', 'async'],
      ['body', 'async'],
      ['async', true, []],
      ['before', 'default'],
      ['body', 'default'],
      ['default', true, 0, 'default'],
    ])
    expect(roles).toEqual(
      Array(6)
        .fill([
          ['cleanup', undefined],
          ['cleanup', true],
        ])
        .flat()
    )
  }
)

it.each(['stack', 'list', 'parallel'] as const)(
  'retains setup fixture closure and refuses injection into returned beforeEach functions: %s',
  async (sequence) => {
    const c = createCollector('returned-cleanup-fixtures')
    const rows: unknown[] = []
    const custom = c.api.test.extend<{
      setup: string
      cleanupOnly: string
    }>({
      setup: async ({}, provide) => {
        rows.push('setup')
        await provide('fixture value')
        rows.push('teardown')
      },
      cleanupOnly: async ({}, provide) => {
        rows.push('unexpected cleanup fixture')
        await provide('unused')
      },
    })
    c.api.describe('closure', () => {
      custom.beforeEach(
        ({ setup }) =>
          function (this: unknown, ...args: unknown[]) {
            rows.push(['closure', this === undefined, args, setup])
          }
      )
      custom('body', ({ setup }) => {
        rows.push(['body', setup])
      })
    })
    c.api.describe('returned callback parameters are not fixtures', () => {
      custom.beforeEach(({ setup }) => {
        rows.push(['before', setup])
        return function ({ cleanupOnly }: { cleanupOnly: string }) {
          rows.push(['unexpected cleanup body', cleanupOnly])
        }
      })
      custom('body', ({ setup }) => {
        rows.push(['body', setup])
      })
    })
    const result = await runCollected(
      c.close(),
      { ...options(), sequence: { hooks: sequence } },
      () => {}
    )
    expect(result.cases.map(({ status }) => status)).toEqual([
      'passed',
      'failed',
    ])
    expect(result.errors).toEqual([])
    expect(result.cases[1].errors).toHaveLength(1)
    expect(result.cases[1].errors[0].phase).toBe('cleanup')
    expect(result.cases[1].errors[0].error).toBeInstanceOf(TypeError)
    expect((result.cases[1].errors[0].error as Error).message).toContain(
      'cleanupOnly'
    )
    expect(rows).toEqual([
      'setup',
      ['body', 'fixture value'],
      ['closure', true, [], 'fixture value'],
      'teardown',
      'setup',
      ['before', 'fixture value'],
      ['body', 'fixture value'],
      'teardown',
    ])
  }
)

it.each(
  (['stack', 'list', 'parallel'] as const).flatMap((sequence) =>
    [
      {
        name: 'local budget',
        global: 1000,
        local: 10,
        delay: 40,
        passed: false,
      },
      {
        name: 'larger local budget',
        global: 10,
        local: 1000,
        delay: 40,
        passed: true,
      },
      {
        name: 'disabled local budget',
        global: 10,
        local: 0,
        delay: 40,
        passed: true,
      },
      {
        name: 'inherited budget',
        global: 10,
        local: undefined,
        delay: 40,
        passed: false,
      },
    ].map((setting) => [sequence, setting] as const)
  )
)(
  'keeps returned beforeEach cleanup budgets independent of the outer drain: %s %s',
  async (sequence, setting) => {
    const c = createCollector('returned-cleanup-budget')
    const events: string[] = []
    const receivers: unknown[] = []
    let settled = Promise.resolve()
    c.api.beforeEach(() => {
      events.push('setup')
      return async function (this: unknown, ...args: unknown[]) {
        receivers.push([this === undefined, args])
        events.push('cleanup-start')
        settled = new Promise<void>((resolve) => {
          setTimeout(() => {
            events.push('cleanup-end')
            resolve()
          }, setting.delay)
        })
        await settled
      }
    }, setting.local)
    c.api.test('body', () => {
      events.push('body')
    })
    c.api.afterAll(async () => {
      events.push('afterAll-start')
      await settled
      events.push('afterAll-end')
    }, 1000)
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        hookTimeout: setting.global,
        sequence: { hooks: sequence },
      },
      () => {}
    )
    expect(receivers).toEqual([[true, []]])
    expect(result.cases).toHaveLength(1)
    expect(result.cases[0].status).toBe(setting.passed ? 'passed' : 'failed')
    expect(result.errors).toEqual([])
    expect(result.interrupted).toBe(!setting.passed)
    expect(
      result.cases[0].errors.map(({ phase, error }) => {
        if (!(error instanceof Error))
          throw new Error('Expected a cleanup deadline Error.')
        return [phase, error.message]
      })
    ).toEqual(
      setting.passed
        ? []
        : [
            [
              'cleanup',
              `Hook timed out in ${setting.local ?? setting.global}ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".`,
            ],
          ]
    )
    expect(events).toEqual(
      setting.passed
        ? [
            'setup',
            'body',
            'cleanup-start',
            'cleanup-end',
            'afterAll-start',
            'afterAll-end',
          ]
        : [
            'setup',
            'body',
            'cleanup-start',
            'afterAll-start',
            'cleanup-end',
            'afterAll-end',
          ]
    )
  }
)

it.each(
  (['stack', 'list', 'parallel'] as const).flatMap((sequence) =>
    (['beforeEach', 'afterEach', 'cleanup'] as const).map(
      (phase) => [sequence, phase] as const
    )
  )
)(
  'aborts actual case-hook deadlines before failure processing: %s %s',
  async (sequence, phase) => {
    const c = createCollector('hook-deadline-signal')
    const events: string[] = []
    const pending: Promise<void>[] = []
    const observed: { signal?: AbortSignal; state?: string } = {}
    const wait = (role: string) => {
      events.push(role + '-start')
      const work = new Promise<void>((resolve) => {
        setTimeout(() => {
          events.push(role + '-end')
          resolve()
        }, 40)
      })
      pending.push(work)
      return work
    }
    c.api.beforeEach(async (context) => {
      observed.signal = context.signal
      context.signal.addEventListener(
        'abort',
        () => {
          observed.state = context.task.result?.state
          events.push('abort')
        },
        { once: true }
      )
      context.onTestFinished(() => {
        events.push('finished')
      })
      if (phase === 'beforeEach') await wait(phase)
      if (phase === 'cleanup')
        return async function (this: unknown, ...args: unknown[]) {
          expect(this).toBeUndefined()
          expect(args).toEqual([])
          await wait(phase)
        }
    }, 10)
    c.api.afterEach(async () => {
      if (phase === 'afterEach') await wait(phase)
    }, 10)
    c.api.afterAll(async () => {
      await Promise.all(pending)
    }, 1000)
    c.api.test('body', () => {
      events.push('body')
    })
    const result = await runCollected(
      c.close(),
      {
        ...options(),
        sequence: { hooks: sequence },
        onCaseEnd: () => {
          events.push('case-end')
        },
      },
      () => {}
    )
    expect(result.cases[0].status).toBe('failed')
    expect(result.interrupted).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.cases[0].errors).toHaveLength(1)
    expect(result.cases[0].errors[0].phase).toBe(phase)
    expect(observed.signal?.aborted).toBe(true)
    expect(observed.signal?.reason).toBe(result.cases[0].errors[0].error)
    expect(observed.state).toBe(phase === 'beforeEach' ? 'run' : 'pass')
    expect(events.filter((event) => event === 'abort')).toHaveLength(1)
    expect(events.indexOf('abort')).toBeLessThan(events.indexOf('finished'))
    expect(events.indexOf('finished')).toBeLessThan(events.indexOf('case-end'))
    expect(events.includes('body')).toBe(phase !== 'beforeEach')
  }
)

it.each(
  (['stack', 'list', 'parallel'] as const).flatMap((sequence) =>
    (['beforeEach', 'afterEach', 'cleanup'] as const).map(
      (phase) => [sequence, phase] as const
    )
  )
)(
  'leaves ordinary case-hook failures un-aborted: %s %s',
  async (sequence, phase) => {
    const c = createCollector('ordinary-hook-failure-signal')
    const thrown = new Error('ordinary hook failure')
    let signal: AbortSignal | undefined
    let aborts = 0
    c.api.beforeEach((context) => {
      signal = context.signal
      context.signal.addEventListener('abort', () => {
        aborts++
      })
      if (phase === 'beforeEach') throw thrown
      if (phase === 'cleanup')
        return () => {
          throw thrown
        }
    }, 1000)
    c.api.afterEach(() => {
      if (phase === 'afterEach') throw thrown
    }, 1000)
    c.api.test('body', () => {})
    const result = await runCollected(
      c.close(),
      { ...options(), sequence: { hooks: sequence } },
      () => {}
    )
    expect(result.cases[0].status).toBe('failed')
    expect(result.cases[0].errors).toEqual([{ phase, error: thrown }])
    expect(result.interrupted).toBe(false)
    expect(signal?.aborted).toBe(false)
    expect(aborts).toBe(0)
  }
)

it.each(['stack', 'list', 'parallel'] as const)(
  'preserves external cancellation over a later returned-hook deadline: %s',
  async (sequence) => {
    const c = createCollector('cancelled-hook-deadline-signal')
    const external = new AbortController()
    const reason = new Error('external cancellation')
    let signal: AbortSignal | undefined
    let aborts = 0
    let pending = Promise.resolve()
    c.api.beforeEach((context) => {
      signal = context.signal
      context.signal.addEventListener('abort', () => {
        aborts++
      })
      return async () => {
        pending = new Promise<void>((resolve) => setTimeout(resolve, 40))
        queueMicrotask(() => external.abort(reason))
        await pending
      }
    }, 10)
    c.api.afterAll(async () => {
      await pending
    }, 1000)
    c.api.test('body', () => {})
    const result = await runCollected(
      c.close(),
      { runId: 'run', signal: external.signal, sequence: { hooks: sequence } },
      () => {}
    )
    await pending
    expect(signal?.reason).toBe(reason)
    expect(aborts).toBe(1)
    expect(result.interrupted).toBe(true)
  }
)

it.each(['stack', 'list', 'parallel'] as const)(
  'keeps disabled returned-hook deadlines and settled hooks un-aborted: %s',
  async (sequence) => {
    const c = createCollector('disabled-hook-deadline-signal')
    let signal: AbortSignal | undefined
    let aborts = 0
    c.api.beforeEach((context) => {
      signal = context.signal
      context.signal.addEventListener('abort', () => {
        aborts++
      })
      return async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 40))
      }
    }, 0)
    c.api.test('body', () => {})
    const result = await runCollected(
      c.close(),
      { ...options(), hookTimeout: 10, sequence: { hooks: sequence } },
      () => {}
    )
    expect(result.cases[0].status).toBe('passed')
    expect(result.interrupted).toBe(false)
    expect(signal?.aborted).toBe(false)
    expect(aborts).toBe(0)
  }
)

it.each(['stack', 'list', 'parallel'] as const)(
  'retains non-body publication veto after an expected BODY failure and returned-hook deadline: %s',
  async (sequence) => {
    const c = createCollector('expected-failure-hook-deadline-signal')
    let signal: AbortSignal | undefined
    let pending = Promise.resolve()
    c.api.beforeEach((context) => {
      signal = context.signal
      return async () => {
        pending = new Promise<void>((resolve) => setTimeout(resolve, 40))
        await pending
      }
    }, 10)
    c.api.afterAll(async () => {
      await pending
    }, 1000)
    c.api.test.fails('body', () => {
      throw new Error('expected body failure')
    })
    const result = await runCollected(
      c.close(),
      { ...options(), sequence: { hooks: sequence } },
      () => {}
    )
    expect(result.cases[0].status).toBe('passed')
    expect(result.cases[0].errors).toEqual([])
    expect(signal?.reason).toBeInstanceOf(Error)
    expect(signal?.reason).toMatchObject({
      message:
        'Hook timed out in 10ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".',
    })
    expect(result.interrupted).toBe(true)
  }
)

it.each(['stack', 'list', 'parallel'] as const)(
  'retains the registered hook deadline, source and abort identity in %s order',
  async (sequence) => {
    for (const role of ['beforeEach', 'afterEach', 'cleanup'] as const) {
      const c = createCollector('registered-hook-deadline-' + sequence + role)
      const aborted: unknown[] = []
      let signal: AbortSignal | undefined
      const pending = (context: { signal: AbortSignal }) => {
        signal = context.signal
        return new Promise<void>((resolve) => {
          context.signal.addEventListener(
            'abort',
            () => {
              const error = context.signal.reason as Error
              aborted.push(error, error.message, error.stack)
              resolve()
            },
            { once: true }
          )
        })
      }
      function registerDeadlineHook() {
        if (role === 'beforeEach') c.api.beforeEach(pending, 5)
        else if (role === 'afterEach') c.api.afterEach(pending, 5)
        else c.api.beforeEach((context) => () => pending(context), 5)
      }
      registerDeadlineHook()
      c.api.test('one', () => {})
      const result = await runCollected(
        c.close(),
        { ...options(), sequence: { hooks: sequence } },
        () => {}
      )
      expect(result.cases[0].status).toBe('failed')
      expect(result.interrupted).toBe(true)
      expect(result.cases[0].errors).toHaveLength(1)
      const failure = result.cases[0].errors[0]
      const error = failure.error as Error
      const message =
        'Hook timed out in 5ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".'
      expect(error.message).toBe(message)
      expect(error.stack).toContain('registerDeadlineHook')
      expect(error.stack).not.toContain('Timeout.<anonymous>')
      expect(signal?.reason).toBe(error)
      expect(aborted).toEqual([error, message, error.stack])
      expect(Reflect.ownKeys(error)).toEqual(['stack', 'message', 'operation'])
      expect(
        Object.getOwnPropertyDescriptor(failure, 'registrationError')
      ).toMatchObject({ value: error, enumerable: false })
      expect(Object.keys(failure)).toEqual(['phase', 'error'])
      expect(error).not.toHaveProperty('cause')
    }
  }
)

it('keeps generic listener resource deadlines separate from registered hook diagnostics', async () => {
  const c = createCollector('generic-listener-deadline')
  c.api.test('one', ({ onTestFinished }) => {
    onTestFinished(() => new Promise<void>(() => {}), 5)
  })
  const result = await run(c)
  expect(result.cases[0].status).toBe('failed')
  expect(result.cases[0].errors).toHaveLength(1)
  const error = result.cases[0].errors[0].error as Error
  expect(error.message).toBe('Next test timed out after 5ms.')
  expect(error.stack).toContain('Timeout.<anonymous>')
  expect(Reflect.ownKeys(error)).toEqual(['stack', 'message', 'operation'])
})

it('retains one hook registration and its captured budget across repeated executions', async () => {
  const c = createCollector('reused-hook-registration')
  function registerReusedDeadlineHook() {
    c.api.beforeEach(
      ({ signal }) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true })
        }),
      5
    )
  }
  registerReusedDeadlineHook()
  c.api.test('one', () => {})
  const suite = c.close()
  const hook = suite.hooks.beforeEach[0]
  const registration = hook.registrationError
  expect(registration).toBeInstanceOf(Error)
  expect(Object.keys(hook)).not.toContain('registrationError')
  let previous: Error | undefined
  for (const fallback of [15, 50]) {
    const result = await runCollected(
      suite,
      { ...options(), hookTimeout: fallback },
      () => {}
    )
    const error = result.cases[0].errors[0].error as Error
    expect(result.interrupted).toBe(true)
    expect(error.message).toBe(
      'Hook timed out in 5ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".'
    )
    expect(error.stack).toContain(`Error: ${error.message}\n`)
    expect(error.stack).toContain('registerReusedDeadlineHook')
    expect(error).not.toBe(previous)
    expect(hook.registrationError).toBe(registration)
    expect(hook.timeout).toBe(5)
    previous = error
  }
})

it.each(['stack', 'list', 'parallel'] as const)(
  'retains authored All-hook deadline identity and origin in %s order',
  async (sequence) => {
    for (const role of ['beforeAll', 'afterAll'] as const) {
      const c = createCollector('registered-all-hook-' + sequence + role)
      function registerAuthoredAllDeadline() {
        c.api[role](() => new Promise<void>(() => {}), 5)
      }
      registerAuthoredAllDeadline()
      c.api.test('one', () => {})
      const result = await runCollected(
        c.close(),
        { ...options(), sequence: { hooks: sequence } },
        () => {}
      )
      expect(result.cases[0].status).toBe(
        role === 'beforeAll' ? 'skipped' : 'passed'
      )
      expect(result.interrupted).toBe(true)
      expect(result.errors).toHaveLength(1)
      const failure = result.errors[0]
      const error = failure.error as Error
      expect(failure.phase).toBe(role)
      expect(error.message).toBe(
        'Hook timed out in 5ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".'
      )
      expect(error.stack).toContain('registerAuthoredAllDeadline')
      expect(error.stack).not.toContain('Timeout.<anonymous>')
      expect(Reflect.ownKeys(error)).toEqual(['stack', 'message', 'operation'])
      expect(
        Object.getOwnPropertyDescriptor(failure, 'registrationError')
      ).toMatchObject({ value: error, enumerable: false, writable: false })
      expect(Object.keys(failure)).toEqual(['phase', 'error'])
      expect(error).not.toHaveProperty('registrationError')
    }
  }
)

it.each(['stack', 'list', 'parallel'] as const)(
  'preserves disabled and inherited registered All-hook budgets in %s order',
  async (sequence) => {
    for (const role of ['beforeAll', 'afterAll'] as const) {
      const disabled = createCollector('disabled-all-hook-' + sequence + role)
      disabled.api[role](
        () => new Promise<void>((resolve) => setTimeout(resolve, 5)),
        0
      )
      disabled.api.test('one', () => {})
      const passed = await runCollected(
        disabled.close(),
        { ...options(), hookTimeout: 1, sequence: { hooks: sequence } },
        () => {}
      )
      expect(passed.cases[0].status).toBe('passed')
      expect(passed.errors).toEqual([])
      expect(passed.interrupted).toBe(false)

      const inherited = createCollector('inherited-all-hook-' + sequence + role)
      function registerInheritedAllDeadline() {
        inherited.api[role](() => new Promise<void>(() => {}))
      }
      registerInheritedAllDeadline()
      inherited.api.test('one', () => {})
      const failed = await runCollected(
        inherited.close(),
        { ...options(), hookTimeout: 5, sequence: { hooks: sequence } },
        () => {}
      )
      expect(failed.errors).toHaveLength(1)
      const failure = failed.errors[0]
      const error = failure.error as Error
      expect(error.message).toContain('Hook timed out in 5ms.\n')
      expect(error.stack).toContain('registerInheritedAllDeadline')
      expect(failure.registrationError).toBe(error)
    }
  }
)

it('associates the actual parallel All-hook failure with its own registration', async () => {
  for (const role of ['beforeAll', 'afterAll'] as const) {
    const c = createCollector('parallel-selected-all-hook-' + role)
    function registerHealthyAllHook() {
      c.api[role](() => {}, 20)
    }
    function registerFailingAllHook() {
      c.api[role](() => new Promise<void>(() => {}), 5)
    }
    registerHealthyAllHook()
    registerFailingAllHook()
    c.api.test('one', () => {})
    const result = await runCollected(
      c.close(),
      { ...options(), sequence: { hooks: 'parallel' } },
      () => {}
    )
    expect(result.errors).toHaveLength(1)
    const error = result.errors[0].error as Error
    expect(error.message).toContain('Hook timed out in 5ms.\n')
    expect(error.stack).toContain('registerFailingAllHook')
    expect(error.stack).not.toContain('registerHealthyAllHook')
    expect(result.errors[0].registrationError).toBe(error)
  }
})

it('preserves generic suite integration deadlines without an authored hook carrier', async () => {
  for (const stage of ['begin', 'finalize'] as const) {
    const c = createCollector('generic-suite-integration-' + stage)
    c.api.beforeAll(() => {}, 5)
    c.api.test('one', () => {})
    const result = await runCollected(c.close(), options(), () => {}, {
      beginHook: () =>
        stage === 'begin'
          ? new Promise<never>(() => {})
          : {
              finalize: () => new Promise<void>(() => {}),
              dispose: async () => {},
            },
      setActiveHook: () => {},
    })
    expect(result.errors).toHaveLength(1)
    const failure = result.errors[0]
    const error = failure.error as Error
    expect(error.message).toBe('Next test timed out after 5ms.')
    expect(error.stack).toContain('Timeout.<anonymous>')
    expect(failure).not.toHaveProperty('registrationError')
  }
})

it('retains the captured All-hook budget and stack header when its declaration is reused', async () => {
  for (const role of ['beforeAll', 'afterAll'] as const) {
    const c = createCollector('reused-all-registration-' + role)
    function registerReusedAllDeadline() {
      c.api[role](() => new Promise<void>(() => {}), 5)
    }
    registerReusedAllDeadline()
    c.api.test('one', () => {})
    const suite = c.close()
    const hook = suite.hooks[role][0]
    const registration = hook.registrationError
    let previous: Error | undefined
    for (const hookTimeout of [15, 50]) {
      const result = await runCollected(
        suite,
        { ...options(), hookTimeout },
        () => {}
      )
      const error = result.errors[0].error as Error
      expect(error.message).toContain('Hook timed out in 5ms.\n')
      expect(error.stack).toContain(`Error: ${error.message}\n`)
      expect(error.stack).toContain('registerReusedAllDeadline')
      expect(error).not.toBe(previous)
      expect(hook.registrationError).toBe(registration)
      expect(hook.timeout).toBe(5)
      previous = error
    }
  }
})

it('runs actual Chai prototype descriptor callbacks with guarded receiver and lifetime controls', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_CHAI199_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, 'next-chai-descriptors-'))
  const argv = [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'chai-descriptors-integration.ts'),
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    await fs.writeFile(join(evidence, 'stdout.log'), stdout)
    await fs.writeFile(join(evidence, 'stderr.log'), stderr)
    await fs.writeFile(
      join(evidence, 'owned-child.json'),
      JSON.stringify(
        {
          pid: child.pid,
          argv: [process.execPath, ...argv],
          actualClose,
          stdoutClosed: child.stdout?.destroyed,
          stderrClosed: child.stderr?.destroyed,
          error: failure === undefined ? null : String(failure),
        },
        null,
        2
      )
    )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 4')
    expect(stdout).toContain('# pass 4')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_CHAI199_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

it('runs collection-created Chai prototype callables with live invocation owners', async () => {
  const fs = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const base = process.env.NEXT_TESTING_CHAI202_EVIDENCE ?? tmpdir()
  await fs.mkdir(base, { recursive: true })
  const evidence = await fs.mkdtemp(join(base, 'next-chai-collection-'))
  const argv = [
    '--test-reporter=tap',
    '--import',
    require.resolve('tsx'),
    join(__dirname, 'chai-collection-integration.ts'),
  ]
  const pending = promisify(execFile)(process.execPath, argv, {
    timeout: 20000,
  })
  const child = pending.child
  const closed = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  let stdout = ''
  let stderr = ''
  let failure: unknown
  try {
    try {
      const result = await pending
      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      failure = error
      const raw = error as { stdout?: string; stderr?: string }
      stdout = raw.stdout ?? ''
      stderr = raw.stderr ?? ''
    }
    const actualClose = await closed
    await fs.writeFile(join(evidence, 'stdout.log'), stdout)
    await fs.writeFile(join(evidence, 'stderr.log'), stderr)
    await fs.writeFile(
      join(evidence, 'owned-child.json'),
      JSON.stringify(
        {
          pid: child.pid,
          argv: [process.execPath, ...argv],
          actualClose,
          stdoutClosed: child.stdout?.destroyed,
          stderrClosed: child.stderr?.destroyed,
          error: failure === undefined ? null : String(failure),
        },
        null,
        2
      )
    )
    if (failure !== undefined) throw failure
    expect(actualClose).toEqual({ code: 0, signal: null })
    expect(stdout).toContain('# tests 4')
    expect(stdout).toContain('# pass 4')
    expect(stdout).toContain('# fail 0')
  } finally {
    if (!process.env.NEXT_TESTING_CHAI202_EVIDENCE)
      await fs.rm(evidence, { recursive: true, force: true })
  }
}, 30000)

describe('raw test declaration fn', () => {
  const receiver = () => ({
    concurrent: false,
    only: false,
    skip: false,
    todo: false,
    fails: false,
  })

  it('publishes one readonly root callable and shares its actual helper members', () => {
    const c = createCollector('raw-declaration')
    const t = c.api.test
    expect(Object.getOwnPropertyDescriptor(t, 'fn')).toEqual({
      value: t.fn,
      enumerable: false,
      configurable: false,
      writable: false,
    })
    expect([t.fn.name, t.fn.length]).toEqual(['', 3])
    expect(t.fn).toBe(c.api.it.fn)
    expect((t.fn as any).each).toBe(t.each)
    expect((t.fn as any).for).toBe(t.for)
    expect((t.fn as any).extend).toBe(t.extend)
    expect((t.fn as any).describe).toBe(c.api.describe)
    for (const key of ['skip', 'only', 'todo', 'concurrent', 'fails'])
      expect(t[key].fn).toBeUndefined()
    expect(t.skipIf(false)).toBe(t)
    expect(t.runIf(true)).toBe(t)
    expect(t.extend({ value: 3 }).fn).not.toBe(t.fn)
  })

  it('retains receiver reads, authored option writes and raw public fails values', () => {
    const c = createCollector('raw-receiver')
    const reads: string[] = []
    const context: any = {}
    for (const key of [
      'concurrent',
      'only',
      'skip',
      'todo',
      'fails',
      'ignored',
    ])
      Object.defineProperty(context, key, {
        enumerable: true,
        get() {
          reads.push(`receiver:${key}`)
          return key === 'fails' ? 1 : false
        },
      })
    let concurrent = true
    const opts: any = {}
    Object.defineProperty(opts, 'concurrent', {
      enumerable: true,
      get() {
        reads.push('options:get-concurrent')
        return concurrent
      },
      set(value) {
        reads.push(`options:set-concurrent:${value}`)
        concurrent = value
      },
    })
    expect(c.api.test.fn.call(context, 'raw', opts, () => {})).toBeUndefined()
    expect(reads).toEqual([
      'receiver:concurrent',
      'options:set-concurrent:false',
      'receiver:concurrent',
      'receiver:only',
      'receiver:skip',
      'receiver:todo',
      'receiver:fails',
      'receiver:ignored',
      'options:get-concurrent',
    ])
    expect(c.root.children[0].options.fails).toBe(1)
    expect(concurrent).toBe(false)
    expect(() =>
      c.api.test('ordinary', { concurrent: 1 as any }, () => {})
    ).toThrow('Test concurrent must be a boolean.')
    expect(() =>
      c.api.test('ordinary fails', { fails: 1 as any }, () => {})
    ).toThrow('Test fails must be a boolean.')
    expect(c.root.children).toHaveLength(1)
  })

  it('does not implicitly bind the extended template to an explicit raw receiver', async () => {
    const c = createCollector('raw-fixtures')
    const observed: unknown[] = []
    const extended = c.api.test.extend({ value: 3 })
    extended.fn.call(receiver(), 'raw', {}, ({ value }) => {
      observed.push(value)
    })
    extended('ordinary', ({ value }) => {
      observed.push(value)
    })
    const result = await run(c)
    expect(result.cases.map((c) => c.status)).toEqual(['passed', 'passed'])
    expect(observed).toEqual([undefined, 3])
  })

  it('requires an actual chain receiver for the shared parameter and fixture helpers', () => {
    const c = createCollector('raw-members')
    const raw = c.api.test.fn as any
    for (const key of ['each', 'for'])
      expect(() => raw[key]([1])).toThrow(
        "Cannot read properties of undefined (reading 'withContext')"
      )
    for (const key of ['extend', 'override'])
      expect(() => raw[key]({ value: 1 })).toThrow(
        "Cannot read properties of undefined (reading 'getFixtures')"
      )
    raw.each.call(c.api.test.skip, [1])('skipped %i', () => {})
    expect(c.root.children.map((c) => [c.name, c.mode])).toEqual([
      ['skipped 1', 'skip'],
    ])
  })

  it('dispatches held raw declarations to the live collector without borrowing a closed scope', () => {
    let active: ReturnType<typeof createCollector> | undefined
    const first = createCollector('first', { getActiveCollector: () => active })
    const held = first.api.test.fn
    first.close()
    const second = createCollector('second')
    active = second
    held.call(receiver(), 'second declaration', {}, () => {})
    expect(first.root.children).toHaveLength(0)
    expect(second.root.children.map((c) => c.name)).toEqual([
      'second declaration',
    ])
    const late: Error[] = []
    const scope = createAsyncScope(
      { kind: 'collection', context: { id: 'old', name: 'old' } },
      (error) => late.push(error)
    )
    scope.close()
    let caught: unknown
    scope.run(() => {
      try {
        held.call(receiver(), 'late', {}, () => {})
      } catch (error) {
        caught = error
      }
    })
    expect(caught).toBe(late[0])
    expect(late[0].message).toContain('closed collection scope "old"')
    expect(second.root.children).toHaveLength(1)
  })

  it('keeps a cached raw suite alias subject to its originating collection scope', () => {
    let active: ReturnType<typeof createCollector> | undefined
    const first = createCollector('first alias', {
      getActiveCollector: () => active,
    })
    const heldAlias = (first.api.test.fn as any).describe
    first.close()
    const second = createCollector('second alias')
    active = second
    heldAlias('live suite', () => second.api.test('child', () => {}))
    expect(first.root.children).toHaveLength(0)
    expect(second.root.children.map((child) => child.name)).toEqual([
      'live suite',
    ])
    const late: Error[] = []
    const scope = createAsyncScope(
      { kind: 'collection', context: { id: 'old-alias', name: 'old alias' } },
      (error) => late.push(error)
    )
    scope.close()
    let caught: unknown
    scope.run(() => {
      try {
        heldAlias('late suite', () => second.api.test('late child', () => {}))
      } catch (error) {
        caught = error
      }
    })
    expect(caught).toBe(late[0])
    expect(late[0].message).toContain('closed collection scope "old alias"')
    expect(second.root.children).toHaveLength(1)
  })
})

it('matches complete compiled raw fn declaration rows in both Node modes', async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'declaration-fn-integration.cjs')],
    { encoding: 'utf8', timeout: 125000, maxBuffer: 4 * 1024 * 1024 }
  )
  const actual = JSON.parse(stdout)
  expect(
    actual.profiles.map(({ mode, group, cases, rows }) => ({
      mode,
      group,
      cases,
      rows,
    }))
  ).toEqual([
    { mode: 'development', group: 'contract', cases: 14, rows: 2 },
    { mode: 'development', group: 'focus', cases: 3, rows: 1 },
    { mode: 'development', group: 'retention', cases: 9, rows: 2 },
    { mode: 'production', group: 'contract', cases: 14, rows: 2 },
    { mode: 'production', group: 'focus', cases: 3, rows: 1 },
    { mode: 'production', group: 'retention', cases: 9, rows: 2 },
  ])
}, 130000)

it('retains the pinned public fn receiver and fixture type contract', async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'declaration-fn-types.cjs')],
    { encoding: 'utf8', timeout: 30000 }
  )
  const actual = JSON.parse(stdout)
  expect(actual.rootConfigAndGlobalAugmentations).toBe(true)
  expect(actual.results[0]).toEqual({ kind: 'positive', diagnostics: [] })
  expect(actual.results[1].diagnostics.map(({ code }) => code)).toEqual([
    2345, 2559, 2339, 2339, 2322,
  ])
}, 35000)
