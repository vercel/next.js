/* eslint-disable no-empty-pattern -- Fixtures declare dependencies with object destructuring. */
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  initializeTestFile,
  getActiveAttempt,
  getActiveHook,
} from 'next/dist/experimental/testing/runner'
import {
  test,
  describe,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  onTestFinished,
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
  const runner = initializeTestFile({ fileId: 'entry', filePath: file })
  try {
    await fn(runner, file)
  } finally {
    await runner.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}

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
        expect.assertions(4)
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
    assert.ok(result.cases[0].errors[0].error instanceof AggregateError)
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

it('asserts in returned suite cleanup and rejects hook snapshots without a case identity', async () => {
  await withFile(async (runner) => {
    await runner.collect(async () => {
      beforeAll(() => {
        expect.assertions(1)
        expect(1).toBe(1)
        return () => {
          assert.equal(getActiveAttempt(), undefined)
          assert.equal(getActiveHook()?.hook, 'cleanup')
          expect(1).toBe(2)
        }
      })
      test('case', () => expect(1).toBe(1))
      afterAll(() => {
        expect(1).toMatchSnapshot()
      })
    })
    const result = await runner.run(options())
    assert.equal(result.cases[0].status, 'passed')
    assert.deepEqual(result.errors.map((error) => error.phase).sort(), [
      'afterAll',
      'cleanup',
    ])
    assert.match(
      String(result.errors.find((error) => error.phase === 'afterAll')!.error),
      /snapshot/i
    )
  })
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

it('fails descendants on setup assertions and restores setup spies at file disposal', async () => {
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
    assert.equal(result.cases[0].status, 'failed')
    assert.equal(result.cases[0].errors[0].phase, 'beforeAll')
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
