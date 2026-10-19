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
    expect(String(result.cases[0].errors[0].error)).toContain('after 1ms')
  })

  it('rejects injected fixture tuples while preserving static array values', async () => {
    const c = createCollector('file')
    expect(() =>
      c.api.test.extend<{ value: unknown }>({
        value: [
          async ({}, provide: (value: unknown) => Promise<void>) => {
            await provide(42)
          },
          { injected: true },
        ] as any,
      })
    ).toThrow('fixture option "injected"')
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
    expect(result.cases[0].status).toBe('passed')
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
  expect(stdout).toContain('# tests 51')
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
