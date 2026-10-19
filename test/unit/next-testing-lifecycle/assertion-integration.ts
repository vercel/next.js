/* eslint-disable no-empty-pattern -- Fixtures declare dependencies with object destructuring. */
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { mkdtemp, rm, access, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  initializeTestFile,
  initializeTestWorker,
  getActiveAttempt,
  getActiveHook,
} from 'next/dist/experimental/testing/runner'
import {
  test,
  describe,
  expect,
  createExpect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  aroundAll,
  onTestFinished,
  onTestFailed,
} from 'next/dist/experimental/testing/vitest'

declare module 'next/dist/experimental/testing/vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Matchers<R, T> {
    toBeAnswer(): R
    toResolveAnswer(): Promise<R>
  }
}

const options = () => ({
  runId: 'integration',
  signal: new AbortController().signal,
})

// Actual C and D implementations in a fresh process. No Jest matcher globals,
// mocked assertion adapter, Vite server, or Vitest execution runtime is involved.
async function withFile(
  fn: (
    runner: ReturnType<typeof initializeTestFile>,
    file: string
  ) => Promise<void>
) {
  const directory = await mkdtemp(join(tmpdir(), 'next-lifecycle-assertions-'))
  const file = join(directory, 'example.test.ts')
  const runner = initializeTestFile({
    fileId: 'entry',
    filePath: file,
    resourceLifetime: 'attempt',
  })
  try {
    await fn(runner, file)
  } finally {
    await runner.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}

it('collects configured shuffle and concurrent defaults before setup while retaining sequential overrides', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-lifecycle-sequence-'))
  const runner = initializeTestFile({
    fileId: 'sequence',
    filePath: join(directory, 'file.test.ts'),
    sequence: {
      concurrent: true,
      shuffle: { tests: true, files: false },
      seed: 8127,
    },
  })
  const trace: string[] = []
  let a!: () => void
  let b!: () => void
  const first = new Promise<void>((resolve) => {
    a = resolve
  })
  const second = new Promise<void>((resolve) => {
    b = resolve
  })
  try {
    await runner.collect(async () => {
      describe('inherited defaults', () => {
        test('first', async ({ expect: check }) => {
          a()
          await second
          check(true).toBe(true)
        })
        test('second', async ({ expect: check }) => {
          b()
          await first
          check(true).toBe(true)
        })
        describe('ordered', { concurrent: false, shuffle: false }, () => {
          test('one', () => {
            trace.push('one')
          })
          test('two', () => {
            trace.push('two')
          })
        })
      })
      describe.shuffle('explicit shuffle', { concurrent: false }, () => {
        for (const name of ['s0', 's1', 's2'])
          test(name, ({ expect: check }) => {
            check(true).toBe(true)
            trace.push(name)
          })
      })
    })
    const result = await runner.run({ ...options(), sequence: { seed: 8127 } })
    assert.equal(result.cases.length, 7)
    assert.ok(result.cases.every(({ status }) => status === 'passed'))
    assert.deepEqual(result.errors, [])
    assert.deepEqual(
      trace.filter((name) => name.startsWith('s')),
      ['s1', 's2', 's0']
    )
    assert.deepEqual(
      trace.filter((name) => !name.startsWith('s')),
      ['one', 'two']
    )
  } finally {
    await runner.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

it('executes concurrent bodies with isolated local counts and real asynchronous assertion ownership', async () => {
  await withFile(async (runner) => {
    let first!: () => void
    let second!: () => void
    const a = new Promise<void>((resolve) => {
      first = resolve
    })
    const b = new Promise<void>((resolve) => {
      second = resolve
    })
    const owners = new Set<unknown>()
    await runner.collect(async () => {
      test.concurrent('first', async ({ expect: check, task }) => {
        owners.add(getActiveAttempt())
        first()
        await b
        check.assertions(1)
        await check(Promise.resolve(task.name)).resolves.toBe('first')
      })
      test.concurrent('second', async ({ expect: check, task }) => {
        owners.add(getActiveAttempt())
        second()
        await a
        check.assertions(2)
        check(task.name).toBe('second')
        check(task.context.task).toBe(task)
      })
    })
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map(({ status }) => status),
      ['passed', 'passed']
    )
    assert.equal(owners.size, 2)
    assert.deepEqual(result.errors, [])
  })
})

it('retains assertion counts and fixture cleanup during a concurrent retry', async () => {
  await withFile(async (runner) => {
    let release!: () => void
    let siblingStarted!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const sibling = new Promise<void>((resolve) => {
      siblingStarted = resolve
    })
    let attempts = 0
    let cleanups = 0
    await runner.collect(async () => {
      const extended = test.extend('value', ({}, { onCleanup }) => {
        onCleanup(() => {
          cleanups++
        })
        return ++attempts
      })
      extended.concurrent(
        'retry',
        { retry: 1 },
        async ({ expect: check, value }) => {
          await sibling
          if (value === 1) throw new Error('retry')
          check.assertions(1)
          check(value).toBe(2)
          release()
        }
      )
      test.concurrent('other owner', async ({ expect: check }) => {
        siblingStarted()
        await gate
        check.assertions(2)
        check(true).toBe(true)
        check(attempts).toBe(2)
      })
    })
    const result = await runner.run(options())
    assert.equal(
      result.cases.filter(({ status }) => status === 'failed').length,
      1
    )
    assert.equal(
      result.cases.filter(({ status }) => status === 'passed').length,
      2
    )
    assert.equal(cleanups, 2)
    assert.deepEqual(result.errors, [])
  })
})

it('isolates concurrent suite hooks and resumes aroundAll with only its own descendants closed', async () => {
  await withFile(async (runner) => {
    let releaseA!: () => void
    let releaseB!: () => void
    const a = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    const b = new Promise<void>((resolve) => {
      releaseB = resolve
    })
    const trace: string[] = []
    await runner.collect(async () => {
      ;['a', 'b'].forEach((name) =>
        describe.concurrent(name, () => {
          aroundAll(async (execute) => {
            const owner = getActiveHook()
            expect(owner?.hook).toBe('aroundAll')
            await execute()
            assert.equal(getActiveHook(), owner)
            expect(owner?.hook).toBe('aroundAll')
            trace.push(`${name} wrapper closed`)
          })
          beforeAll(async () => {
            const owner = getActiveHook()
            if (name === 'a') {
              releaseA()
              await b
            } else {
              releaseB()
              await a
            }
            assert.equal(getActiveHook(), owner)
            expect(owner?.hook).toBe('beforeAll')
          })
          test('body', ({ expect: check }) => {
            check.assertions(1)
            check(name.length).toBe(1)
          })
        })
      )
    })
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map(({ status }) => status),
      ['passed', 'passed']
    )
    assert.deepEqual(result.errors, [])
    assert.equal(trace.length, 2)
  })
})

it('rejects a retained concurrent assertion and closed asynchronous owner while another case runs', async () => {
  await withFile(async (runner) => {
    let release!: () => void
    let started!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const other = new Promise<void>((resolve) => {
      started = resolve
    })
    let retained: any
    let late!: Promise<unknown>
    await runner.collect(async () => {
      test.concurrent('original', async ({ expect: check }) => {
        retained = check(true)
        late = gate.then(() => check(true).toBe(true))
        await other
      })
      test.concurrent('other', async ({ expect: check }) => {
        started()
        await Promise.resolve()
        // A retained assertion cannot borrow this concurrently live owner.
        assert.throws(
          () => retained.toBe(true),
          /different Next assertion scope/
        )
      })
      test('following', async ({ expect: check }) => {
        release()
        await assert.rejects(late, /closed attempt scope/)
        check(true).toBe(true)
      })
    })
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map(({ status }) => status),
      ['passed', 'passed', 'passed']
    )
    assert.equal(result.errors.length, 1)
    assert.match(String(result.errors[0].error), /closed attempt scope/)
  })
})

it('aroundAll suspends real assertion scopes while preserving nested wrapper counts and ownership', async () => {
  await withFile(async (runner) => {
    const trace: string[] = []
    await runner.collect(async () => {
      aroundAll(async (execute) => {
        const owner = getActiveHook()
        expect.assertions(2)
        expect(owner?.hook).toBe('aroundAll')
        trace.push('outer+')
        await execute()
        assert.equal(getActiveHook(), owner)
        trace.push('outer-')
        expect(trace.at(-1)).toBe('outer-')
      })
      aroundAll(async (execute) => {
        expect.assertions(2)
        expect(trace.at(-1)).toBe('outer+')
        trace.push('inner+')
        await execute()
        trace.push('inner-')
        expect(trace.at(-1)).toBe('inner-')
      })
      beforeAll(() => {
        expect.assertions(1)
        expect(getActiveHook()?.hook).toBe('beforeAll')
        trace.push('setup')
      })
      afterAll(() => {
        expect.assertions(1)
        expect(getActiveHook()?.hook).toBe('afterAll')
        trace.push('teardown')
      })
      describe('nested', () => {
        aroundAll(async (execute) => {
          expect.assertions(2)
          expect(getActiveHook()?.name).toBe('nested')
          trace.push('nested+')
          await execute()
          trace.push('nested-')
          expect(trace.at(-1)).toBe('nested-')
        })
        test('body', ({ expect: localExpect }) => {
          localExpect.assertions(1)
          localExpect(getActiveAttempt()?.testName).toBe('body')
          trace.push('body')
        })
      })
    })
    const result = await runner.run(options())
    assert.equal(
      result.cases[0].status,
      'passed',
      JSON.stringify(result.cases[0].errors)
    )
    assert.deepEqual(result.errors, [])
    assert.deepEqual(trace, [
      'outer+',
      'inner+',
      'setup',
      'nested+',
      'body',
      'nested-',
      'teardown',
      'inner-',
      'outer-',
    ])
  })
})

it('aroundAll restores real assertion counts after an inner setup failure', async () => {
  await withFile(async (runner) => {
    await runner.collect(async () => {
      aroundAll(async (execute) => {
        expect.assertions(2)
        expect(getActiveHook()?.hook).toBe('aroundAll')
        await execute()
        expect(getActiveHook()?.hook).toBe('aroundAll')
      })
      beforeAll(() => {
        throw new Error('setup failure')
      })
      afterAll(() => {
        expect(getActiveHook()?.hook).toBe('afterAll')
      })
      test('blocked', () => {
        throw new Error('body must not run')
      })
    })
    const result = await runner.run(options())
    assert.equal(result.cases[0].status, 'skipped')
    assert.deepEqual(result.cases[0].errors, [])
    assert.deepEqual(
      result.errors.map(({ phase }) => phase),
      ['beforeAll']
    )
  })
})

it('aroundAll rejects suspended-owner assertions and retains closed-hook guards after disposal', async () => {
  await withFile(async (runner) => {
    const during = deferred()
    const after = deferred()
    let suspended!: Promise<unknown>
    let late!: Promise<unknown>
    const failures: Error[] = []
    await runner.collect(async () => {
      aroundAll(async (execute) => {
        expect.assertions(2)
        expect(getActiveHook()?.hook).toBe('aroundAll')
        suspended = during.promise.then(() => expect(true).toBe(true))
        late = after.promise.then(() => expect(true).toBe(true))
        await execute()
        expect(getActiveHook()?.hook).toBe('aroundAll')
      })
      test('body', () => {
        during.resolve()
        return assert.rejects(
          suspended,
          /active Next test attempt or suite hook/
        )
      })
    })
    const result = await runner.run({
      ...options(),
      onLateFailure: (error) => {
        failures.push(error)
      },
    })
    assert.equal(
      result.cases[0].status,
      'passed',
      JSON.stringify(result.cases[0].errors)
    )
    assert.deepEqual(result.errors, [])
    await runner.dispose()
    after.resolve()
    await assert.rejects(late, /closed hook scope/)
    assert.equal(failures.length, 1)
    assert.deepEqual(result.cases[0].errors, [])
  })
})

it('runs builder fixture hooks through real assertion scopes and file lifetimes', async () => {
  await withFile(async (runner) => {
    const trace: string[] = []
    await runner.collect(async () => {
      const owned = test
        .extend('file', { scope: 'file' }, ({}, { onCleanup }) => {
          assert.equal(getActiveAttempt(), undefined)
          trace.push('file setup')
          onCleanup(() => {
            assert.equal(getActiveAttempt(), undefined)
            trace.push('file cleanup')
          })
          return 'file'
        })
        .extend('value', ({ file }, { onCleanup }) => {
          assert.equal(file, 'file')
          trace.push('test setup')
          onCleanup(() => {
            assert.equal(getActiveAttempt()?.testName, 'builder fixture body')
            trace.push('test cleanup')
          })
          return 42
        })
      owned.aroundAll(async (execute, { file }) => {
        expect.assertions(2)
        expect(file).toBe('file')
        trace.push('around setup')
        await execute()
        expect(trace.at(-1)).toBe('file cleanup')
        trace.push('around cleanup')
      })
      owned.beforeAll(({ file }) => {
        expect(file).toBe('file')
        trace.push('beforeAll')
      })
      owned.beforeEach(({ value }) => {
        expect.assertions(2)
        expect(value).toBe(42)
        trace.push('beforeEach')
      })
      owned.afterEach(({ value }) => {
        expect(value).toBe(42)
        trace.push('afterEach')
      })
      owned.afterAll(({ file }) => {
        expect(file).toBe('file')
        trace.push('afterAll')
      })
      owned('builder fixture body', ({ value }) => {
        expect(value).toBe(42)
        trace.push('body')
      })
    })
    const result = await runner.run(options())
    assert.equal(
      result.cases[0].status,
      'passed',
      JSON.stringify(result.cases[0].errors)
    )
    assert.deepEqual(result.errors, [])
    assert.deepEqual(trace, [
      'file setup',
      'around setup',
      'beforeAll',
      'test setup',
      'beforeEach',
      'body',
      'afterEach',
      'test cleanup',
      'afterAll',
      'file cleanup',
      'around cleanup',
    ])
  })
})

it('rejects test fixture requests from bound suite hooks in the real assertion runtime', async () => {
  await withFile(async (runner) => {
    await runner.collect(async () => {
      const owned = test.extend<{ value: number }>({
        value: async ({}, provide) => provide(42),
      })
      owned.beforeAll(({ value }) => expect(value).toBe(42))
      owned('blocked', () => {
        throw new Error('body must not run')
      })
    })
    const result = await runner.run(options())
    assert.equal(result.cases[0].status, 'skipped')
    assert.deepEqual(result.cases[0].errors, [])
    assert.equal(result.errors.length, 1)
    assert.equal(result.errors[0].phase, 'beforeAll')
    assert.match(
      String(result.errors[0].error),
      /Test-scoped fixtures cannot be used inside beforeAll/
    )
  })
})

it('preserves public context, local expectation and signal identity through retries and repeats', async () => {
  await withFile(async (runner) => {
    let owner: unknown
    let expectation: unknown
    let signal: unknown
    await runner.collect(async () => {
      test('stable context', { retry: 1, repeats: 1 }, (context) => {
        if (!owner) {
          owner = context
          expectation = context.expect
          signal = context.signal
        } else {
          assert.equal(context, owner)
          assert.equal(context.expect, expectation)
          assert.equal(context.signal, signal)
        }
        assert.equal(context.task.context, context)
        context.expect(1).toBe(1)
        context.onTestFinished((finished) => {
          assert.equal(finished, owner)
        })
        if (context.task.result?.retryCount === 0)
          throw new Error('first attempt')
      })
    })
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map(({ status }) => status),
      ['failed', 'passed', 'passed']
    )
    assert.deepEqual(result.errors, [])
  })
})

it('rejects stale asynchronous owners and assertions while retaining the stable public context', async () => {
  await withFile(async (runner) => {
    const release = deferred()
    let pending!: Promise<unknown>
    let assertion: any
    await runner.collect(async () => {
      test('stable guarded context', { retry: 1 }, async (context) => {
        if (context.task.result?.retryCount === 0) {
          assertion = context.expect(true)
          pending = release.promise.then(() => context.expect(true).toBe(true))
          throw new Error('retry')
        }
        release.resolve()
        await assert.rejects(pending, /closed attempt scope/)
        assert.throws(
          () => assertion.toBe(true),
          /different Next assertion scope/
        )
        context.expect(true).toBe(true)
      })
    })
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map(({ status }) => status),
      ['failed', 'passed']
    )
    assert.equal(result.errors.length, 1)
    assert.match(String(result.errors[0].error), /closed attempt scope/)
  })
})

it('runs the next case after a timed-out body cooperatively closes with real assertions', async () => {
  await withFile(async (runner) => {
    await runner.collect(async () => {
      test('cooperative timeout', { timeout: 1 }, async ({ signal }) => {
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true })
        )
      })
      test('following', () => expect(true).toBe(true))
    })
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map(({ status }) => status),
      ['failed', 'passed']
    )
    assert.equal(result.interrupted, true)
  })
})

it('shares facade assertions through setup, hooks, body and cleanup, and restores spies', async () => {
  await withFile(async (runner) => {
    const subject = { value: () => 'original' }
    await runner.collect(async () => {
      expect.extend({
        toBeAnswer(received) {
          return { pass: received === 42, message: () => 'expected 42' }
        },
      })
      beforeEach(() => {
        expect.assertions(2)
        vi.spyOn(subject, 'value').mockReturnValue('mock')
      })
      afterEach(() => {
        expect(subject.value()).toBe('mock')
      })
      describe('suite', () =>
        test('body', () => {
          assert.equal(getActiveAttempt()?.name, 'suite > body')
          expect(subject.value()).toBe('mock')
          expect(42).toBeAnswer()
          onTestFinished(() => {
            expect(true).toBe(true)
          })
        }))
    })
    const result = await runner.run(options())
    assert.equal(
      result.cases[0].status,
      'passed',
      JSON.stringify(result.cases[0].errors)
    )
    assert.equal(subject.value(), 'original')
    assert.equal(getActiveAttempt(), undefined)
    assert.throws(() => expect(true), /active Next test attempt/)
  })
})

it('finalizes assertion counts per retry and retains the first failed attempt', async () => {
  await withFile(async (runner) => {
    let attempts = 0
    await runner.collect(async () =>
      test('retry', { retry: 1 }, () => {
        expect.assertions(1)
        if (++attempts > 1) expect(1).toBe(1)
      })
    )
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map((value) => value.status),
      ['failed', 'passed']
    )
    assert.equal(result.cases[0].errors[0].phase, 'assertion')
    assert.match(
      String(result.cases[0].errors[0].error),
      /expected number of assertions to be 1, but got 0/
    )
  })
})

it('does not turn cooperative cancellation into a missing assertion failure and still restores resources', async () => {
  await withFile(async (runner) => {
    const controller = new AbortController()
    const subject = { value: () => 'original' }
    let cleanup = false
    await runner.collect(async () => {
      afterEach(() => {
        cleanup = true
      })
      test('cancelled', () => {
        vi.spyOn(subject, 'value').mockReturnValue('mock')
        expect.assertions(1)
        controller.abort(new Error('cancelled'))
      })
    })
    const result = await runner.run({
      runId: 'cancelled',
      signal: controller.signal,
    })
    assert.equal(result.interrupted, true)
    assert.equal(result.cases[0].status, 'cancelled')
    assert.deepEqual(result.cases[0].errors, [])
    assert.equal(cleanup, true)
    assert.equal(subject.value(), 'original')
  })
})

it('attributes unawaited async assertions to their active attempt', async () => {
  await withFile(async (runner) => {
    await runner.collect(async () => {
      expect.extend({
        async toResolveAnswer(received) {
          return {
            pass: (await received) === 42,
            message: () => 'expected async 42',
          }
        },
      })
      test('unawaited', () => {
        expect(Promise.resolve(0)).toResolveAnswer()
      })
      test('clean next attempt', () => expect(1).toBe(1))
    })
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map((value) => value.status),
      ['failed', 'passed']
    )
    assert.equal(result.cases[0].errors[0].phase, 'assertion')
  })
})

it('restores spy state even when assertion finalization and custom disposal fail', async () => {
  await withFile(async (runner) => {
    const subject = { value: () => 'original' }
    await runner.collect(async () =>
      test('failure', () => {
        vi.spyOn(subject, 'value').mockReturnValue('mock')
        expect.assertions(1)
      })
    )
    const result = await runner.run({
      ...options(),
      beginAttempt: () => ({
        async finalize() {},
        async dispose() {
          throw new Error('resource disposal failed')
        },
      }),
    })
    assert.equal(result.cases[0].status, 'failed')
    assert.deepEqual(
      result.cases[0].errors.map((error) => error.phase),
      ['assertion', 'cleanup']
    )
    assert.equal(subject.value(), 'original')
  })
})

it('releases the file runtime after a collection failure and rejects unsupported APIs', async () => {
  await withFile(async (runner) => {
    await assert.rejects(
      runner.collect(async () => {
        throw new Error('collection failed')
      }),
      /collection failed/
    )
  })
  await withFile(async (runner) => {
    await runner.collect(async () => {
      assert.throws(() => (vi as any).mock, /does not support vi.mock/)
      test('new file', () => expect(true).toBe(true))
    })
    assert.equal((await runner.run(options())).cases[0].status, 'passed')
  })
})

it('keeps snapshot I/O read-only through the real facade', async () => {
  await withFile(async (runner, file) => {
    await runner.collect(async () =>
      test('snapshot', () => expect({ answer: 42 }).toMatchSnapshot())
    )
    const result = await runner.run(options())
    assert.equal(result.cases[0].status, 'failed')
    await runner.dispose()
    await assert.rejects(
      access(join(file, '..', '__snapshots__', 'example.test.ts.snap'))
    )
  })
})

it('retains original settled unawaited assertion diagnostics', async () => {
  await withFile(async (runner) => {
    await runner.collect(async () =>
      test('settled rejection', async () => {
        expect(Promise.resolve(1)).resolves.toBe(2)
        await new Promise<void>((resolve) => setImmediate(resolve))
      })
    )
    const result = await runner.run(options())
    assert.equal(result.cases[0].status, 'failed')
    const diagnostics: unknown[] = []
    function collect(error: unknown) {
      diagnostics.push(error)
      if (error instanceof AggregateError) error.errors.forEach(collect)
    }
    result.cases[0].errors.forEach((failure) => collect(failure.error))
    assert.ok(
      diagnostics.some(
        (error: any) => error.actual === 1 && error.expected === 2
      ),
      'original matcher actual/expected must survive settlement'
    )
  })
})

it('permits intentionally awaited and caught async assertions', async () => {
  await withFile(async (runner) => {
    await runner.collect(async () =>
      test('caught rejection', async () => {
        await assert.rejects(expect(Promise.resolve(1)).resolves.toBe(2))
        await new Promise<void>((resolve) => setImmediate(resolve))
      })
    )
    const result = await runner.run(options())
    assert.equal(result.cases[0].status, 'passed')
  })
})

it('supports canonical cleanup/retry assertions in root afterAll without a case identity', async () => {
  await withFile(async (runner) => {
    let active = 0
    let attempts = 0
    await runner.collect(async () => {
      describe('cleanup and retries', () => {
        beforeAll(() => {
          active += 10
          return () => {
            active -= 10
          }
        })
        beforeEach(() => {
          active += 1
          return () => {
            active -= 1
          }
        })
        test('retries with cleanup between attempts', { retry: 2 }, () => {
          expect(active).toBe(11)
          attempts++
          expect(attempts).toBe(3)
        })
      })
      afterAll(() => {
        assert.equal(getActiveAttempt(), undefined)
        assert.equal(getActiveHook()?.hook, 'afterAll')
        expect(active).toBe(0)
        expect(attempts).toBe(3)
      })
    })
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map((value) => value.status),
      ['failed', 'failed', 'passed']
    )
    assert.deepEqual(result.errors, [])
    assert.equal(getActiveHook(), undefined)
  })
})

it('attributes settled async afterAll assertion failures to the hook, without synthetic cases', async () => {
  await withFile(async (runner) => {
    await runner.collect(async () => {
      test('real case', () => expect(true).toBe(true))
      afterAll(async () => {
        expect(Promise.resolve(1)).resolves.toBe(2)
        await new Promise<void>((resolve) => setImmediate(resolve))
      })
    })
    const result = await runner.run(options())
    assert.equal(result.cases.length, 1)
    assert.equal(result.cases[0].status, 'passed')
    assert.equal(result.errors[0].phase, 'afterAll')
    const error = result.errors[0].error as AggregateError
    assert.ok(
      error.errors.some((value) => value.actual === 1 && value.expected === 2)
    )
  })
})

it('rejects afterAll snapshots and stops returned suite cleanup after hook failure', async () => {
  await withFile(async (runner) => {
    let cleaned = false
    await runner.collect(async () => {
      beforeAll(() => {
        expect.assertions(1)
        expect(1).toBe(1)
        return () => {
          cleaned = true
        }
      })
      test('case', () => expect(1).toBe(1))
      afterAll(() => {
        expect(1).toMatchSnapshot()
      })
    })
    const result = await runner.run(options())
    assert.equal(result.cases[0].status, 'passed')
    assert.deepEqual(
      result.errors.map((error) => error.phase),
      ['afterAll']
    )
    assert.equal(cleaned, false)
    assert.match(
      String(result.errors.find((error) => error.phase === 'afterAll')!.error),
      /snapshot/i
    )
  })
})

it('asserts in returned suite cleanup and rejects cleanup snapshots after successful afterAll', async () => {
  for (const snapshot of [false, true]) {
    await withFile(async (runner) => {
      let afterRan = false
      let cleaned = false
      await runner.collect(async () => {
        beforeAll(() => () => {
          cleaned = true
          assert.equal(getActiveAttempt(), undefined)
          assert.equal(getActiveHook()?.hook, 'cleanup')
          if (snapshot) expect(1).toMatchSnapshot()
          else expect(1).toBe(2)
        })
        afterAll(() => {
          afterRan = true
          expect(1).toBe(1)
        })
        test('case', () => expect(1).toBe(1))
      })
      const result = await runner.run(options())
      assert.equal(result.cases[0].status, 'passed')
      assert.equal(afterRan, true)
      assert.equal(cleaned, true)
      assert.deepEqual(
        result.errors.map((error) => error.phase),
        ['cleanup']
      )
      if (snapshot) assert.match(String(result.errors[0].error), /snapshot/i)
      else assert.match(String(result.errors[0].error), /expected 1 to be 2/)
    })
  }
})

it('preserves setup spies across cases and restores them at file disposal', async () => {
  const subject = { value: () => 'original' }
  await withFile(async (runner) => {
    await runner.collect(async () => {
      beforeAll(() => {
        vi.spyOn(subject, 'value').mockReturnValue('setup')
        expect(subject.value()).toBe('setup')
      })
      test('first case', () => expect(subject.value()).toBe('setup'))
      test('second case', () => expect(subject.value()).toBe('setup'))
      afterAll(() => expect(subject.value()).toBe('setup'))
    })
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map((value) => value.status),
      ['passed', 'passed']
    )
    assert.deepEqual(result.errors, [])
  })
  assert.equal(subject.value(), 'original')
})

it('skips descendants on setup assertions and restores setup spies at file disposal', async () => {
  const subject = { value: () => 'original' }
  await withFile(async (runner) => {
    await runner.collect(async () => {
      beforeAll(() => {
        vi.spyOn(subject, 'value').mockReturnValue('setup')
        expect(1).toBe(2)
      })
      test('blocked', () => {
        throw new Error('must not run')
      })
    })
    const result = await runner.run(options())
    assert.equal(result.cases[0].status, 'skipped')
    assert.deepEqual(result.cases[0].errors, [])
    assert.equal(result.errors[0].phase, 'beforeAll')
  })
  assert.equal(subject.value(), 'original')
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

it('does not lend later assertion counts to deferred hook or earlier-case callbacks', async () => {
  await withFile(async (runner) => {
    const gate = deferred()
    const pending: Promise<unknown>[] = []
    await runner.collect(async () => {
      beforeAll(() => {
        pending.push(gate.promise.then(() => expect(1).toBe(1)))
      })
      test('first', () => {
        pending.push(gate.promise.then(() => expect(2).toBe(2)))
      })
      test('second', async () => {
        expect.assertions(2)
        gate.resolve()
        const settled = await Promise.allSettled(pending)
        assert.ok(settled.every((value) => value.status === 'rejected'))
      })
    })
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map((value) => value.status),
      ['passed', 'failed']
    )
    assert.equal(result.cases[0].errors.length, 0)
    assert.equal(result.errors.length, 2)
    assert.match(String(result.errors[0].error), /closed hook scope/)
    assert.match(String(result.errors[1].error), /closed attempt scope "first"/)
  })
})

it('rejects deferred cached spy APIs before they affect the active case', async () => {
  await withFile(async (runner) => {
    const gate = deferred()
    const pending: Promise<unknown>[] = []
    const subject = { value: () => 'original' }
    await runner.collect(async () => {
      beforeAll(() => {
        const spyOn = vi.spyOn
        const clearAllMocks = vi.clearAllMocks
        pending.push(
          gate.promise.then(() =>
            spyOn(subject, 'value').mockReturnValue('late')
          )
        )
        pending.push(gate.promise.then(() => clearAllMocks()))
      })
      test('active', async () => {
        const mock = vi.fn()
        mock()
        gate.resolve()
        assert.ok(
          (await Promise.allSettled(pending)).every(
            (value) => value.status === 'rejected'
          )
        )
        expect(mock).toHaveBeenCalledTimes(1)
        expect(subject.value()).toBe('original')
      })
    })
    const result = await runner.run(options())
    assert.equal(result.cases[0].status, 'passed')
    assert.equal(result.errors.length, 2)
  })
})

it('guards retained assertions and cached matcher methods after their origin closes', async () => {
  await withFile(async (runner) => {
    const gate = deferred()
    const pending: Promise<unknown>[] = []
    await runner.collect(async () => {
      test('first', () => {
        const assertion = expect(1)
        const matcher = assertion.toBe
        pending.push(gate.promise.then(() => assertion.toBe(1)))
        pending.push(gate.promise.then(() => matcher.call(assertion, 1)))
      })
      test('second', async () => {
        gate.resolve()
        assert.ok(
          (await Promise.allSettled(pending)).every(
            (value) => value.status === 'rejected'
          )
        )
        expect(true).toBe(true)
      })
    })
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map((value) => value.status),
      ['passed', 'passed']
    )
    assert.equal(result.errors.length, 2)
  })
})

it('guards cached mock mutators while preserving spy identity and setup lifetime', async () => {
  const subject = { value: () => 'original' }
  await withFile(async (runner) => {
    const gate = deferred()
    let pending: Promise<unknown> | undefined
    await runner.collect(async () => {
      beforeAll(() => {
        const spy = vi.spyOn(subject, 'value').mockReturnValue('setup')
        assert.equal(spy, subject.value)
        const mutate = spy.mockReturnValue
        pending = gate.promise.then(() => mutate.call(spy, 'late'))
      })
      test('case', async () => {
        gate.resolve()
        await assert.rejects(pending!, /closed hook scope/)
        expect(subject.value()).toBe('setup')
      })
    })
    const result = await runner.run(options())
    assert.equal(result.cases[0].status, 'passed')
    assert.equal(result.errors.length, 1)
  })
  assert.equal(subject.value(), 'original')
})

it('keeps cleanup in its attempt and reports timed-out callbacks released after run', async () => {
  await withFile(async (runner) => {
    const gate = deferred()
    let late: Promise<unknown> | undefined
    let cleanupId: string | undefined
    await runner.collect(async () =>
      test('timeout origin', () => {
        onTestFinished(() => {
          cleanupId = getActiveAttempt()?.id
          expect(true).toBe(true)
        })
        late = gate.promise.then(() => expect(1).toBe(1))
        return new Promise(() => {})
      }, 1)
    )
    const result = await runner.run(options())
    assert.equal(result.cases[0].status, 'failed')
    assert.equal(cleanupId, result.cases[0].attempt.id)
    gate.resolve()
    await assert.rejects(late!, /closed attempt scope "timeout origin"/)
    await assert.rejects(runner.dispose(), /Late Next testing API access/)
    assert.equal(result.cases[0].errors.length, 1)
  })
})

it('keeps the file late-failure sink live after disposal without mutating a sealed case', async () => {
  await withFile(async (runner) => {
    const gate = deferred()
    let late: Promise<unknown> | undefined
    await runner.collect(async () =>
      test('origin', () => {
        late = gate.promise.then(() => expect(1).toBe(1))
      })
    )
    const failures: Error[] = []
    const result = await runner.run({
      ...options(),
      onLateFailure: (error) => {
        failures.push(error)
      },
    })
    await runner.dispose()
    gate.resolve()
    await assert.rejects(late!, /closed attempt scope "origin"/)
    assert.equal(failures.length, 1)
    assert.equal(result.cases[0].status, 'passed')
    assert.equal(result.cases[0].errors.length, 0)
  })
})

it('keeps file fixture continuations outside attempts and test fixture cleanup inside its attempt', async () => {
  await withFile(async (runner) => {
    const origins: (string | undefined)[] = []
    await runner.collect(async () => {
      const fixtureTest = test.extend<{ shared: string; local: string }>({
        shared: [
          async ({}, provide) => {
            assert.equal(getActiveAttempt(), undefined)
            await provide('shared')
            assert.equal(getActiveAttempt(), undefined)
          },
          { scope: 'file' },
        ],
        local: async ({ shared }, provide) => {
          origins.push(getActiveAttempt()?.id)
          await provide(shared)
          origins.push(getActiveAttempt()?.id)
        },
      })
      fixtureTest('one', ({ local }) => expect(local).toBe('shared'))
      fixtureTest('two', ({ local }) => expect(local).toBe('shared'))
    })
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map((value) => value.status),
      ['passed', 'passed']
    )
    assert.deepEqual(result.errors, [])
    assert.deepEqual(origins, [
      result.cases[0].attempt.id,
      result.cases[0].attempt.id,
      result.cases[1].attempt.id,
      result.cases[1].attempt.id,
    ])
  })
})

for (const method of ['mockRestore', 'mockClear'] as const) {
  it(`drains other spy cleanup when ${method} throws`, async () => {
    await withFile(async (runner) => {
      const subject = { a: () => 'original-a', b: () => 'original-b' }
      await runner.collect(async () => {
        test('corrupt cleanup', () => {
          const first = vi.spyOn(subject, 'a').mockReturnValue('mock-a')
          vi.spyOn(subject, 'b').mockReturnValue('mock-b')
          first[method] = () => {
            throw new Error(`${method} failed`)
          }
        })
        test('uncontaminated', () => expect(subject.b()).toBe('original-b'))
      })
      const result = await runner.run(options())
      assert.deepEqual(
        result.cases.map((value) => value.status),
        ['failed', 'passed']
      )
      assert.equal(result.cases[0].errors[0].phase, 'cleanup')
    })
  })
}

for (const origin of ['collection', 'attempt'] as const) {
  it(`reports retained declaration handles from a closed ${origin} after disposal`, async () => {
    await withFile(async (runner) => {
      const gate = deferred()
      const pending: Promise<unknown>[] = []
      await runner.collect(async () => {
        const skip = test.skip
        const extended = test.extend<{ value: number }>({ value: 1 })
        const extend = test.extend
        const conditional = test.skipIf
        const invoke = [
          () => skip('late skip', () => {}),
          () => extended('late extended', () => {}),
          () => extend({ extra: 1 }),
          () => conditional(true),
          () => extended.skip('late chained', () => {}),
        ]
        const schedule = () => {
          for (const call of invoke) pending.push(gate.promise.then(call))
        }
        if (origin === 'collection') schedule()
        test('origin', () => {
          if (origin === 'attempt') schedule()
        })
        skip('valid skipped declaration', () => {})
        extended('valid extended declaration', ({ value }) =>
          expect(value).toBe(1)
        )
      })
      const failures: Error[] = []
      const result = await runner.run({
        ...options(),
        onLateFailure: (error) => {
          failures.push(error)
        },
      })
      await runner.dispose()
      gate.resolve()
      const settled = await Promise.allSettled(pending)
      assert.equal(
        failures.length,
        5,
        JSON.stringify(
          settled.map((value) =>
            value.status === 'fulfilled' ? 'fulfilled' : String(value.reason)
          )
        )
      )
      assert.ok(settled.every((value) => value.status === 'rejected'))
      for (const error of failures)
        assert.match(error.message, new RegExp(`closed ${origin} scope`))
      assert.equal(result.cases[0].status, 'passed')
      assert.equal(result.cases[0].errors.length, 0)
      assert.deepEqual(
        result.cases.map((value) => value.status),
        ['passed', 'skipped', 'passed']
      )
    })
  })
}

it('runtime skipping preserves cleanup and restores spies without retrying or repeating', async () => {
  await withFile(async (runner) => {
    const subject = { value: () => 'original' }
    let attempts = 0
    let cleanup = false
    await runner.collect(async () => {
      afterEach(() => {
        cleanup = true
      })
      test.fails('skipped', { retry: 2, repeats: 2 }, ({ skip }) => {
        attempts++
        vi.spyOn(subject, 'value').mockReturnValue('mock')
        expect.assertions(100)
        skip('skip reason')
      })
      test('next case', () => {
        expect(subject.value()).toBe('original')
      })
    })
    const result = await runner.run(options())
    assert.equal(attempts, 1)
    assert.equal(cleanup, true)
    assert.deepEqual(
      result.cases.map((test) => test.status),
      ['skipped', 'passed']
    )
    assert.equal(result.cases[0].pending, true)
    assert.equal(result.cases[0].note, 'skip reason')
    assert.equal(subject.value(), 'original')
  })
})

it('a retained runtime skip cannot change another attempt even when false or caught', async () => {
  await withFile(async (runner) => {
    let retained!: (condition: boolean) => void
    await runner.collect(async () => {
      test('origin', ({ skip }) => {
        retained = skip
      })
      test('later', () => {
        assert.throws(() => retained(false), /different Next test attempt/)
      })
    })
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map((test) => test.status),
      ['passed', 'passed']
    )
    assert.equal(result.errors.length, 1)
    assert.match(String(result.errors[0].error), /different Next test attempt/)
  })
})

it('keeps local/manual expectation state separate and retains local retry counters', async () => {
  await withFile(async (runner) => {
    let owner: ReturnType<typeof createExpect> | undefined
    let manual: ReturnType<typeof createExpect> | undefined
    let tries = 0
    await runner.collect(async () => {
      manual = createExpect()
      test('local retry', { retry: 1 }, ({ expect: local }) => {
        owner = local
        local.assertions(1)
        local(true).toBe(true)
        if (++tries === 1) throw new Error('first try')
      })
      test('independent counters', ({ expect: local }) => {
        assert.notEqual(local, owner)
        assert.throws(() => owner!(true), /different Next test/)
        assert.throws(() => owner!.getState(), /different Next test/)
        expect.assertions(100)
        manual!.assertions(100)
        manual!(true).toBe(true)
        local.assertions(1)
        local(true).toBe(true)
        assert.equal(manual!.getState().assertionCalls, 1)
        assert.equal(expect.getState().assertionCalls, 0)
      })
    })
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map((test) => test.status),
      ['failed', 'failed', 'passed']
    )
    assert.match(
      String(result.cases[1].errors[0].error),
      /expected number of assertions to be 1, but got 2/
    )
    assert.throws(() => owner!(true), /active Next test attempt/)
  })
})

it('observes local asynchronous and soft failures in the owning attempt', async () => {
  await withFile(async (runner) => {
    await runner.collect(async () => {
      test('local async', ({ expect: local }) => {
        local(Promise.resolve(1)).resolves.toBe(2)
      })
      test('local soft', ({ expect: local }) => {
        local.assertions(2)
        local.soft(1).toBe(2)
      })
      test('clean next', ({ expect: local }) => {
        local.assertions(1)
        local(true).toBe(true)
      })
    })
    const result = await runner.run(options())
    assert.deepEqual(
      result.cases.map((test) => test.status),
      ['failed', 'failed', 'passed']
    )
    const diagnostics = (index: number) => {
      const errors: unknown[] = []
      const collect = (error: unknown) => {
        errors.push(error)
        if (error instanceof AggregateError) error.errors.forEach(collect)
      }
      result.cases[index].errors.forEach((failure) => collect(failure.error))
      return errors
    }
    assert(
      diagnostics(0).some((error: any) =>
        error?.message?.includes('not awaited')
      )
    )
    assert(
      diagnostics(0).some(
        (error: any) => error.actual === 1 && error.expected === 2
      )
    )
    assert(
      diagnostics(1).some((error: any) =>
        error?.message?.includes('assertions to be 2, but got 1')
      )
    )
  })
})

it('drains unawaited annotations, observes publication failures and preserves handled failures', async () => {
  await withFile(async (runner, file) => {
    const directory = join(file, '..')
    await writeFile(join(directory, 'evidence.txt'), 'retained evidence')
    let task: any
    await runner.collect(async () => {
      test('annotations', async (context) => {
        task = context.task
        const note = await context.annotate('file note', {
          path: 'evidence.txt',
        })
        assert.equal(
          await readFile(note.attachment!.path!, 'utf8'),
          'retained evidence'
        )
        assert.equal(note.attachment!.contentType, 'text/plain')
        await assert.rejects(
          context.annotate('absent', { path: 'absent.txt' }),
          { code: 'ENOENT' }
        )
        context.annotate('unawaited')
        onTestFinished(() =>
          assert.deepEqual(
            task.annotations.map((note: any) => note.message),
            ['file note', 'unawaited']
          )
        )
      })
      test('publication failure', (context) => {
        context.annotate('publisher fails')
      })
      test('clean successor', ({ signal }) =>
        assert.equal(signal.aborted, false))
    })
    const result = await runner.run({
      ...options(),
      projectDir: directory,
      onAnnotation(_context, note) {
        if (note.message === 'publisher fails')
          throw new Error('publisher rejected')
      },
    })
    assert.deepEqual(
      result.cases.map((test) => test.status),
      ['passed', 'failed', 'passed']
    )
    assert(
      result.cases[1].errors.some(
        (failure: any) => failure.error.message === 'publisher rejected'
      )
    )
    assert.equal(task.annotations.length, 2)
  })
})

it('retains live task failure state without duplicate soft errors and guards retained annotators', async () => {
  await withFile(async (runner) => {
    let annotate: any
    let observed: any
    await runner.collect(async () => {
      test.fails('soft owner', (context) => {
        annotate = context.annotate
        expect.soft(1).toBe(2)
        assert.equal(context.task.result!.state, 'fail')
        assert.equal(context.task.result!.errors!.length, 1)
        assert.throws(() => context.annotate('late'), /"fail" state already/)
        onTestFailed((failed) => {
          observed = failed.task.result!.errors!.length
        })
      })
      test('new owner', () => {
        assert.throws(() => annotate('retained'), /different Next test attempt/)
      })
    })
    const result = await runner.run(options())
    assert.equal(
      observed,
      1,
      JSON.stringify(result.cases, (_key, value) =>
        value instanceof Error
          ? { name: value.name, message: value.message }
          : value
      )
    )
    assert.deepEqual(
      result.cases.map((test) => test.status),
      ['passed', 'passed']
    )
    assert(
      result.errors.some((failure: any) =>
        failure.error.message.includes('annotate() belongs to a different')
      )
    )
  })
})

it('holds process worker fixtures until host disposal after file cleanup', async () => {
  await withFile(async (file) => {
    const trace: string[] = []
    let creations = 0
    await file.collect(async () => {
      const owned = test
        .extend('worker', { scope: 'worker' }, ({}, { onCleanup }) => {
          assert.equal(getActiveAttempt(), undefined)
          onCleanup(() => {
            assert.equal(getActiveAttempt(), undefined)
            trace.push('worker-')
          })
          return ++creations
        })
        .extend('file', { scope: 'file' }, ({ worker }, { onCleanup }) => {
          onCleanup(() => {
            trace.push('file-')
          })
          return worker
        })
      owned.beforeAll(({ worker }) => assert.equal(worker, 1))
      owned('one', ({ file }) => expect(file).toBe(1))
      owned('two', ({ file }) => expect(file).toBe(1))
      owned.afterAll(({ worker }) => assert.equal(worker, 1))
    })
    const result = await file.run(options())
    assert.deepEqual(
      result.cases.map((test) => test.status),
      ['passed', 'passed']
    )
    assert.deepEqual(result.errors, [])
    assert.equal(creations, 1)
    assert.deepEqual(trace, ['file-'])
    await file.dispose()
    assert.deepEqual(trace, ['file-', 'worker-'])
  })
})

it('drains worker fixture cleanup failures and rejects staged snapshot publication', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-worker-cleanup-'))
  const file = initializeTestFile({
    fileId: 'worker-cleanup',
    filePath: join(directory, 'file.test.ts'),
    updateSnapshots: true,
  })
  const trace: string[] = []
  try {
    await file.collect(async () => {
      const owned = test.extend({
        first: [
          async ({}, provide) => {
            await provide(1)
            trace.push('first-')
            throw new Error('first worker cleanup')
          },
          { scope: 'worker' },
        ],
        second: [
          async ({ first }, provide) => {
            await provide(first)
            trace.push('second-')
            throw new Error('second worker cleanup')
          },
          { scope: 'worker' },
        ],
      })
      owned('body', ({ second }) => expect(second).toMatchSnapshot())
    })
    const result = await file.run(options())
    assert.deepEqual(
      result.cases.map((test) => test.status),
      ['passed']
    )
    await assert.rejects(file.dispose(), (error: AggregateError) => {
      assert.deepEqual(error.errors.map(String), [
        'Error: second worker cleanup',
        'Error: first worker cleanup',
      ])
      return true
    })
    assert.deepEqual(trace, ['second-', 'first-'])
    assert.throws(
      () => file.takeSnapshotUpdates(),
      /successful execution and disposal/
    )
    await assert.rejects(
      access(join(directory, '__snapshots__', 'file.test.ts.snap'))
    )
  } finally {
    await file.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

it('reuses cached declaration hooks and tables across sequential worker files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-shared-collector-'))
  const worker = initializeTestWorker({ workerId: 'cached-collector' })
  const defineOwned = () =>
    test.extend('value', { scope: 'worker' }, () => ++creations)
  let owned: ReturnType<typeof defineOwned>
  let cachedHook: typeof owned.beforeAll
  let cachedTable: ReturnType<typeof owned.for<number>>
  let creations = 0
  let hooks = 0
  try {
    for (const name of ['first', 'second']) {
      const file = worker.createFile({
        fileId: name,
        filePath: join(directory, name + '.test.ts'),
      })
      try {
        // eslint-disable-next-line no-loop-func -- Sequential files intentionally reuse the cached declaration owner.
        await file.collect(async () => {
          if (name === 'first') {
            owned = defineOwned()
            cachedHook = owned.beforeAll
            cachedTable = owned.for([1, 2])
          }
          cachedHook(({ value }) => {
            assert.equal(value, 1)
            hooks++
          })
          owned(name, ({ value }) => expect(value).toBe(1))
          cachedTable('row %s', (row, { value }) => {
            expect(row).toBeGreaterThan(0)
            expect(value).toBe(1)
          })
        })
        const result = await file.run(options())
        assert.deepEqual(
          result.cases.map((test) => test.status),
          ['passed', 'passed', 'passed']
        )
        assert.deepEqual(result.errors, [])
      } finally {
        await file.dispose()
      }
    }
    await worker.dispose()
    assert.equal(creations, 1)
    assert.equal(hooks, 2)
  } finally {
    await worker.dispose().catch(() => {})
    await rm(directory, { recursive: true, force: true })
  }
})

it('keeps a closed first collection from borrowing the next worker file', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'next-closed-shared-collector-')
  )
  const worker = initializeTestWorker({ workerId: 'closed-collector' })
  const defineOwned = () => test.extend('value', { scope: 'worker' }, () => 42)
  let owned: ReturnType<typeof defineOwned>
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let continuation: Promise<void>
  let late: unknown
  try {
    for (const name of ['first', 'second']) {
      const file = worker.createFile({
        fileId: name,
        filePath: join(directory, name + '.test.ts'),
        updateSnapshots: true,
      })
      try {
        // eslint-disable-next-line no-loop-func -- Sequential files intentionally reuse the cached declaration owner.
        await file.collect(async () => {
          if (name === 'first') {
            owned = defineOwned()
            continuation = gate.then(() => {
              try {
                owned('illegal', () => {})
              } catch (error) {
                late = error
              }
            })
          } else {
            release()
            await continuation
            assert.match(String(late), /closed collection scope.*first/)
          }
          owned(name, ({ value }) => expect(value).toMatchSnapshot())
        })
        const result = await file.run(options())
        assert.deepEqual(
          result.cases.map((test) => test.testName),
          [name]
        )
        assert.deepEqual(
          result.cases.map((test) => test.status),
          ['passed']
        )
        await file.dispose()
        assert.throws(
          () => file.takeSnapshotUpdates(),
          /successful execution and disposal/
        )
      } finally {
        await file.dispose()
      }
    }
    assert.equal(worker.getFailures()[0].fileId, 'first')
    await assert.rejects(worker.dispose(), /closed collection scope.*first/)
    assert.throws(
      () =>
        worker.createFile({
          fileId: 'third',
          filePath: join(directory, 'third.test.ts'),
        }),
      /after closing or failure/
    )
  } finally {
    await worker.dispose().catch(() => {})
    await rm(directory, { recursive: true, force: true })
  }
})

it('holds every shared worker snapshot until final worker cleanup succeeds', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'next-shared-worker-snapshots-')
  )
  const worker = initializeTestWorker({ workerId: 'snapshot-worker' })
  const files: ReturnType<typeof worker.createFile>[] = []
  const defineOwned = () =>
    test.extend('value', { scope: 'worker' }, ({}, { onCleanup }) => {
      onCleanup(() => {
        throw new Error('shared worker cleanup failed')
      })
      return 42
    })
  let owned: ReturnType<typeof defineOwned>
  try {
    for (const name of ['first', 'second']) {
      const file = worker.createFile({
        fileId: name,
        filePath: join(directory, name + '.test.ts'),
        updateSnapshots: true,
      })
      files.push(file)
      try {
        // eslint-disable-next-line no-loop-func -- Sequential files intentionally reuse the cached declaration owner.
        await file.collect(async () => {
          if (name === 'first') owned = defineOwned()
          owned(name, ({ value }) => expect(value).toMatchSnapshot())
        })
        const result = await file.run(options())
        assert.deepEqual(
          result.cases.map((test) => test.status),
          ['passed']
        )
      } finally {
        await file.dispose()
      }
    }
    for (const file of files)
      assert.throws(
        () => file.takeSnapshotUpdates(),
        /successful execution and disposal/
      )
    await assert.rejects(worker.dispose(), /shared worker cleanup failed/)
    for (const file of files)
      assert.throws(
        () => file.takeSnapshotUpdates(),
        /successful execution and disposal/
      )
    await assert.rejects(access(join(directory, '__snapshots__')))
  } finally {
    await worker.dispose().catch(() => {})
    await rm(directory, { recursive: true, force: true })
  }
})

it('releases shared worker staged snapshots only after clean worker disposal', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'next-shared-snapshot-success-')
  )
  const worker = initializeTestWorker({ workerId: 'clean-snapshot-worker' })
  const files: ReturnType<typeof worker.createFile>[] = []
  try {
    for (const name of ['first', 'second']) {
      const file = worker.createFile({
        fileId: name,
        filePath: join(directory, name + '.test.ts'),
        updateSnapshots: true,
      })
      files.push(file)
      try {
        await file.collect(async () => {
          test(name, () => expect(name).toMatchSnapshot())
        })
        const result = await file.run(options())
        assert.deepEqual(
          result.cases.map((test) => test.status),
          ['passed']
        )
      } finally {
        await file.dispose()
      }
    }
    for (const file of files)
      assert.throws(
        () => file.takeSnapshotUpdates(),
        /successful execution and disposal/
      )
    await worker.dispose()
    assert.deepEqual(
      files.map((file) => file.takeSnapshotUpdates().length),
      [1, 1]
    )
    await assert.rejects(access(join(directory, '__snapshots__')))
  } finally {
    await worker.dispose().catch(() => {})
    await rm(directory, { recursive: true, force: true })
  }
})
