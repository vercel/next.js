import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { NodeSnapshotEnvironment } from 'next/dist/compiled/next-test-primitives'
import {
  createAssertionRuntime,
  type AssertionAttempt,
  type AssertionHook,
} from 'next/dist/experimental/testing/assertions'

// These are adapter unit tests. They do not claim compiler/runner integration.
describe('Next-owned assertion primitives', () => {
  let directory: string
  let runtime: Awaited<ReturnType<typeof createAssertionRuntime>>
  let activeHook: AssertionHook | undefined
  let active: AssertionAttempt | undefined
  let scope: ReturnType<typeof runtime.beginAttempt> | undefined

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'next-assertions-'))
    const testPath = join(directory, 'example.test.ts')
    await mkdir(join(directory, '__snapshots__'))
    await writeFile(
      join(directory, '__snapshots__', 'example.test.ts.snap'),
      '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n' +
        'exports[`suite > case 1`] = `\n{\n  "answer": 42,\n}\n`;\n' +
        'exports[`suite > case > serializer 1`] = `serialized`;\n'
    )
    runtime = await createAssertionRuntime({
      testPath,
      getCurrentAttempt: () => active,
      getCurrentHook: () => activeHook,
    })
  })

  afterEach(async () => {
    await scope?.dispose()
    scope = undefined
    active = undefined
    activeHook = undefined
    await runtime.finishFile()
    await rm(directory, { recursive: true, force: true })
  })

  function begin(retry = 0) {
    activeHook = undefined
    active = { id: `attempt-${retry}`, testId: 'case', name: 'suite > case' }
    scope = runtime.beginAttempt(active)
    return scope
  }

  it('uses built-in equality, asymmetric, async and spy matchers', async () => {
    begin()
    const check = runtime.expect
    check.assertions(4)
    check({ value: [1, 2] }).toEqual({ value: check.arrayContaining([2]) })
    await check(Promise.resolve(42)).resolves.toBe(42)
    await check(Promise.reject(new Error('failure'))).rejects.toThrow('failure')
    const spy = runtime.spies.fn((value: number) => value * 2)
    spy(2)
    check(spy).toHaveBeenCalledWith(2)
    await scope!.finalize()
  })

  it('supports custom sync and async matcher context', async () => {
    runtime.expect.extend({
      toBeDouble(received, expected) {
        return {
          pass: this.equals(received, expected * 2),
          message: () => 'expected twice the value',
        }
      },
      async toResolveDouble(received, expected) {
        return {
          pass: this.equals(await received, expected * 2),
          message: () => 'expected twice the resolved value',
        }
      },
    })
    begin()
    const check = runtime.expect as any
    check(4).toBeDouble(2)
    await check(Promise.resolve(6)).toResolveDouble(3)
    assert.throws(() => check(3).toBeDouble(2), /expected twice the value/)
    await scope!.finalize()
  })

  it('collects soft assertion failures without stopping the attempt', async () => {
    begin()
    runtime.expect.soft(1).toBe(2)
    runtime.expect.soft({ value: 1 }).toEqual({ value: 2 })
    runtime.expect('continued').toBe('continued')
    await assert.rejects(scope!.finalize(), (error: AggregateError) => {
      assert.equal(error.errors.length, 2)
      assert.deepEqual(
        error.errors.map((item) => item.actual),
        ['1', '{\n  "value": 1,\n}']
      )
      return true
    })
  })

  it('polls with real scheduling and preserves the matcher callsite', async () => {
    begin()
    let value = 0
    setTimeout(() => value++, 15)
    await runtime.expect
      .poll(() => value, { interval: 2, timeout: 200 })
      .toBe(1)
    await assert.rejects(
      runtime.expect.poll(() => value, { interval: 2, timeout: 10 }).toBe(2),
      (error: Error) => {
        assert.match(error.stack!, /cases.ts/)
        assert.ok(error.cause)
        return true
      }
    )
    await scope!.finalize()
  })

  it('rejects an unawaited polling assertion', async () => {
    begin()
    runtime.expect.poll(() => 1).toBe(1)
    await assert.rejects(scope!.finalize(), (error: AggregateError) => {
      assert.match(
        error.errors[0].message,
        /expect\.poll\(\) assertion was not awaited/
      )
      return true
    })
  })

  it('scopes global and environment stubs to one attempt', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, '__nextStub')
    const previousEnv = process.env.NEXT_TEST_ATTEMPT_STUB
    begin()
    runtime.utilities.stubGlobal('__nextStub', 42)
    runtime.utilities.stubEnv('NEXT_TEST_ATTEMPT_STUB', 'changed')
    assert.equal((globalThis as any).__nextStub, 42)
    assert.equal(process.env.NEXT_TEST_ATTEMPT_STUB, 'changed')
    await scope!.finalize()
    await scope!.dispose()
    scope = undefined
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(globalThis, '__nextStub'),
      original
    )
    assert.equal(process.env.NEXT_TEST_ATTEMPT_STUB, previousEnv)
  })

  it('restores fake timers and snapshot serializers after the attempt', async () => {
    const realDate = Date
    const realTimeout = setTimeout
    begin()
    runtime.utilities.useFakeTimers({ now: new Date('2020-01-02T00:00:00Z') })
    let fired = false
    setTimeout(() => {
      fired = true
    }, 25)
    runtime.utilities.advanceTimersByTime(25)
    assert.equal(fired, true)
    assert.equal(Date.now(), Date.parse('2020-01-02T00:00:00Z') + 25)
    runtime.expect.addSnapshotSerializer({
      test(value) {
        return !!value && (value as any).serializable === true
      },
      serialize() {
        return 'serialized'
      },
    })
    active!.name = 'suite > case > serializer'
    runtime.expect({ serializable: true }).toMatchSnapshot()
    await scope!.finalize()
    await scope!.dispose()
    scope = undefined
    assert.equal(Date, realDate)
    assert.equal(setTimeout, realTimeout)
  })

  it('checks assertion counts at finalization and resets between retries', async () => {
    begin()
    runtime.expect.assertions(2)
    runtime.expect(1).toBe(1)
    await assert.rejects(scope!.finalize(), (error: AggregateError) => {
      assert.equal(
        error.errors[0].message,
        'expected number of assertions to be 2, but got 1'
      )
      return true
    })
    await scope!.dispose()
    begin(1)
    runtime.expect.hasAssertions()
    runtime.expect(2).toBe(2)
    await scope!.finalize()
  })

  it('rejects missing and unawaited assertions', async () => {
    begin()
    runtime.expect.hasAssertions()
    await assert.rejects(scope!.finalize(), (error: AggregateError) => {
      assert.equal(
        error.errors[0].message,
        'expected any number of assertion, but got none'
      )
      return true
    })
    await scope!.dispose()
    begin(1)
    runtime.expect(Promise.resolve(42)).resolves.toBe(42)
    await assert.rejects(scope!.finalize(), (error: AggregateError) => {
      assert.match(error.errors[0].message, /was not awaited/)
      return true
    })
  })

  it('rejects unawaited async custom matchers with the original callsite', async () => {
    runtime.expect.extend({
      async toBeAsync() {
        return { pass: true, message: () => '' }
      },
    })
    begin()
    ;(runtime.expect(1) as any).toBeAsync()
    await assert.rejects(scope!.finalize(), (error: AggregateError) => {
      assert.match(error.errors[0].message, /was not awaited/)
      assert.match(error.errors[0].stack, /cases.ts/)
      return true
    })
  })

  it('reads real Vitest snapshots without writing and resets retry counters', async () => {
    begin()
    runtime.expect({ answer: 42 }).toMatchSnapshot()
    await scope!.finalize()
    await scope!.dispose()
    begin(1)
    runtime.expect({ answer: 42 }).toMatchSnapshot()
    await scope!.finalize()
    const contents = await readFile(
      join(directory, '__snapshots__', 'example.test.ts.snap'),
      'utf8'
    )
    assert.match(contents, /suite > case 1/)
    assert.doesNotMatch(contents, /suite > case 2/)
  })

  it('preserves assertion source stacks and snapshot mismatch values', async () => {
    begin()
    let error: any
    try {
      runtime.expect({ answer: 0 }).toMatchSnapshot()
    } catch (caught) {
      error = caught
    }
    assert.match(error.actual, /"answer": 0/)
    assert.match(error.expected, /"answer": 42/)
    assert.match(error.stack, /cases.ts/)
  })

  it('attributes rejected custom matchers to the source assertion', async () => {
    runtime.expect.extend({
      async toRejectAsync() {
        return {
          pass: false,
          message: () => 'custom failure',
          actual: 1,
          expected: 2,
        }
      },
    })
    begin()
    await assert.rejects(
      (runtime.expect(1) as any).toRejectAsync(),
      (error: any) => {
        assert.equal(error.message, 'custom failure')
        assert.equal(error.actual, 1)
        assert.equal(error.expected, 2)
        assert.match(error.stack, /cases.ts/)
        return true
      }
    )
    await scope!.finalize()
  })

  it('preserves missing snapshots in read-only mode', async () => {
    begin()
    assert.throws(
      () => runtime.expect('missing').toMatchSnapshot('absent'),
      /mismatched/
    )
    assert.throws(
      () => (runtime.expect('missing').not as any).toMatchSnapshot(),
      /cannot be used with not/
    )
    const path = join(directory, '__snapshots__', 'example.test.ts.snap')
    const before = await readFile(path, 'utf8')
    await scope!.dispose()
    await runtime.finishFile()
    assert.equal(await readFile(path, 'utf8'), before)
  })

  it('shares spy identity with matchers and restores accessors', async () => {
    begin()
    const object = {
      get value() {
        return 1
      },
    }
    const getter = runtime.spies
      .spyOn(object, 'value', 'get')
      .mockReturnValueOnce(2)
    runtime.expect(object.value).toBe(2)
    runtime.expect(object.value).toBe(1)
    runtime.expect(getter).toHaveBeenCalledTimes(2)
    const fn = runtime.spies
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(3)
      .mockRejectedValueOnce(new Error('spy failure'))
    await runtime.expect(fn()).resolves.toBe(3)
    await runtime.expect(fn()).rejects.toThrow('spy failure')
    await scope!.finalize()
    await scope!.dispose()
    assert.equal(object.value, 1)
  })

  it('rejects overlapping runtimes and attempts', async () => {
    await assert.rejects(
      createAssertionRuntime({
        testPath: join(directory, 'other.test.ts'),
        getCurrentAttempt: () => active,
      }),
      /Only one assertion runtime/
    )
    begin()
    assert.throws(() => runtime.beginAttempt(active!), /already active/)
    await scope!.finalize()
  })

  it('preserves settled unawaited mismatch details', async () => {
    begin()
    runtime.expect(Promise.resolve(1)).resolves.toBe(2)
    // Yield a turn so the primitive removes its settled promise before finalize.
    await setImmediate()
    await assert.rejects(scope!.finalize(), (error: AggregateError) => {
      const failure = error.errors.find((item) => item.actual === 1)
      assert.equal(failure.expected, 2)
      assert.match(failure.stack, /cases.ts/)
      assert.ok(
        error.errors.some((item) => /was not awaited/.test(item.message))
      )
      return true
    })
  })

  it('does not report intentionally consumed and caught mismatch failures', async () => {
    begin()
    await assert.rejects(runtime.expect(Promise.resolve(1)).resolves.toBe(2))
    await setImmediate()
    await scope!.finalize()
  })

  it('rejects implicit new-snapshot mode before touching skipped snapshots', async () => {
    await runtime.finishFile()
    const path = join(directory, '__snapshots__', 'example.test.ts.snap')
    const before = await readFile(path, 'utf8')
    for (const updateSnapshot of ['new'] as const) {
      await assert.rejects(
        createAssertionRuntime({
          testPath: join(directory, 'example.test.ts'),
          getCurrentAttempt: () => undefined,
          snapshotOptions: {
            updateSnapshot,
            snapshotEnvironment: new NodeSnapshotEnvironment(),
          },
        }),
        /new mode is unsupported/
      )
    }
    assert.equal(await readFile(path, 'utf8'), before)
  })

  function beginHook(hook: AssertionHook['hook']) {
    active = undefined
    activeHook = { id: `suite-${hook}`, name: 'suite', hook }
    scope = runtime.beginHook(activeHook)
  }

  it('allows normal, async and count assertions in suite hooks without a case identity', async () => {
    beginHook('beforeAll')
    assert.equal(active, undefined)
    runtime.expect.assertions(2)
    runtime.expect(1).toBe(1)
    await runtime.expect(Promise.resolve(2)).resolves.toBe(2)
    await scope!.finalize()
    await scope!.dispose()
    beginHook('afterAll')
    runtime.expect.hasAssertions()
    await assert.rejects(scope!.finalize(), (error: AggregateError) => {
      assert.match(error.errors[0].message, /got none/)
      return true
    })
  })

  it('retains settled async suite hook diagnostics', async () => {
    beginHook('afterAll')
    runtime.expect(Promise.resolve(1)).resolves.toBe(2)
    await setImmediate()
    await assert.rejects(scope!.finalize(), (error: AggregateError) => {
      assert.ok(
        error.errors.some((item) => item.actual === 1 && item.expected === 2)
      )
      assert.ok(
        error.errors.some((item) => /was not awaited/.test(item.message))
      )
      return true
    })
  })

  it('rejects snapshots in returned suite cleanup without inventing a test identity', async () => {
    beginHook('cleanup')
    assert.throws(
      () => runtime.expect({ answer: 42 }).toMatchSnapshot(),
      /Snapshots are unsupported in suite hooks/
    )
    assert.equal(active, undefined)
    await scope!.finalize()
  })

  it('keeps setup spies through cases and restores them at file disposal', async () => {
    const object = { method: () => 'original' }
    beginHook('beforeAll')
    const setupSpy = runtime.spies
      .spyOn(object, 'method')
      .mockReturnValue('setup')
    await scope!.finalize()
    await scope!.dispose()
    for (let attempt = 0; attempt < 2; attempt++) {
      begin(attempt)
      runtime.expect(runtime.spies.spyOn(object, 'method')).toBe(setupSpy)
      runtime.expect(object.method()).toBe('setup')
      await scope!.finalize()
      await scope!.dispose()
    }
    beginHook('afterAll')
    runtime.expect(setupSpy).toHaveBeenCalledTimes(2)
    await scope!.finalize()
    await scope!.dispose()
    activeHook = undefined
    await runtime.finishFile()
    assert.equal(object.method(), 'original')
  })

  it('drains every owned restore and clear before reporting case cleanup failures', async () => {
    const object = { a: () => 'original-a', b: () => 'original-b' }
    begin()
    const first = runtime.spies.spyOn(object, 'a').mockReturnValue('mock-a')
    runtime.spies.spyOn(object, 'b').mockReturnValue('mock-b')
    const restore = first.mockRestore
    const clear = first.mockClear
    let clears = 0
    first.mockRestore = () => {
      throw new Error('restore-a failed')
    }
    first.mockClear = () => {
      clears++
      throw new Error('clear-a failed')
    }
    await scope!.finalize()
    await assert.rejects(scope!.dispose(), (error: AggregateError) => {
      assert.deepEqual(
        error.errors.map((item) => item.message),
        ['restore-a failed', 'clear-a failed']
      )
      return true
    })
    await scope!.dispose()
    assert.equal(clears, 1)
    begin(1)
    runtime.expect(object.b()).toBe('original-b')
    first.mockRestore = restore
    first.mockClear = clear
    first.mockRestore()
    await scope!.finalize()
  })

  it('continues restoring later spies when an earlier clear fails', async () => {
    const object = { a: () => 'original-a', b: () => 'original-b' }
    begin()
    const first = runtime.spies.spyOn(object, 'a').mockReturnValue('mock-a')
    runtime.spies.spyOn(object, 'b').mockReturnValue('mock-b')
    const clear = first.mockClear
    first.mockClear = () => {
      throw new Error('clear failed')
    }
    await scope!.finalize()
    await assert.rejects(scope!.dispose(), (error: AggregateError) => {
      assert.ok(error.errors.some((item) => item.message === 'clear failed'))
      return true
    })
    begin(1)
    runtime.expect(object.b()).toBe('original-b')
    first.mockClear = clear
    first.mockRestore()
    await scope!.finalize()
  })

  it('drains hook-owned spies and restores file state despite cleanup failures', async () => {
    const object = { a: () => 'original-a', b: () => 'original-b' }
    beginHook('beforeAll')
    const first = runtime.spies.spyOn(object, 'a').mockReturnValue('mock-a')
    runtime.spies.spyOn(object, 'b').mockReturnValue('mock-b')
    const restore = first.mockRestore
    const clear = first.mockClear
    first.mockRestore = () => {
      throw new Error('file restore failed')
    }
    first.mockClear = () => {
      throw new Error('file clear failed')
    }
    await scope!.finalize()
    await scope!.dispose()
    activeHook = undefined
    await assert.rejects(runtime.finishFile(), (error: AggregateError) => {
      assert.ok(
        error.errors.some((item) => item.message === 'file restore failed')
      )
      assert.ok(
        error.errors.some((item) => item.message === 'file clear failed')
      )
      return true
    })
    assert.equal(object.b(), 'original-b')
    first.mockRestore = restore
    first.mockClear = clear
    assert.equal(object.a(), 'original-a')
    await runtime.finishFile()
  })

  it('rejects stale originating assertion and spy contexts', async () => {
    beginHook('beforeAll')
    const oldHook = activeHook
    await scope!.finalize()
    await scope!.dispose()
    begin()
    const oldAttempt = active
    await scope!.finalize()
    await scope!.dispose()
    begin(1)
    const currentAttempt = active
    runtime.expect.assertions(1)
    active = oldAttempt
    assert.throws(() => runtime.expect(1).toBe(1), /requires an active/)
    assert.throws(() => runtime.spies.fn(), /requires an active/)
    assert.throws(() => runtime.spies.clearAllMocks(), /requires an active/)
    assert.throws(() => runtime.spies.resetAllMocks(), /requires an active/)
    assert.throws(() => runtime.spies.restoreAllMocks(), /requires an active/)
    assert.throws(
      () => runtime.expect.setState({ assertionCalls: 2 }),
      /requires an active/
    )
    assert.throws(() => runtime.expect.getState(), /requires an active/)
    assert.throws(() => runtime.expect.extend({}), /requires an active/)
    active = undefined
    activeHook = oldHook
    assert.throws(() => runtime.expect(2).toBe(2), /requires an active/)
    assert.throws(
      () => runtime.spies.spyOn({ method() {} }, 'method'),
      /requires an active/
    )
    active = currentAttempt
    activeHook = undefined
    runtime.expect(3).toBe(3)
    await scope!.finalize()
  })

  it('rejects retained assertion chains and matcher functions from another scope', async () => {
    begin()
    const assertion = runtime.expect(1)
    const matcher = assertion.toBe
    await scope!.finalize()
    await scope!.dispose()
    begin(1)
    assert.throws(() => assertion.not.toBe(2), /different Next assertion scope/)
    assert.throws(
      () => matcher.call(assertion, 1),
      /different Next assertion scope/
    )
    await scope!.finalize()
  })

  it('guards cached mock mutators without changing setup spy identity', async () => {
    const object = { method: () => 'original' }
    beginHook('beforeAll')
    const spy = runtime.spies.spyOn(object, 'method').mockReturnValue('setup')
    const mutate = spy.mockReturnValue
    const oldHook = activeHook
    await scope!.finalize()
    await scope!.dispose()
    begin()
    const currentAttempt = active
    active = undefined
    activeHook = oldHook
    assert.throws(() => mutate('late'), /requires an active/)
    assert.equal(object.method, spy)
    active = currentAttempt
    activeHook = undefined
    runtime.expect(object.method()).toBe('setup')
    spy.mockReturnValue('current')
    runtime.expect(object.method()).toBe('current')
    await scope!.finalize()
  })

  it('preserves chained assertions, matcher calls and async promise consumption', async () => {
    begin()
    await runtime.expect(Promise.resolve(1)).resolves.not.toBe(2)
    runtime.expect(3).to.be.a('number').and.equal(3)
    const assertion = runtime.expect(4)
    assertion.toBe.call(assertion, 4)
    const mock = runtime.spies.fn().mockReturnValue('value')
    runtime.expect(mock()).toBe('value')
    runtime.spies.clearAllMocks()
    runtime.expect(mock).not.toHaveBeenCalled()
    await scope!.finalize()
  })

  it('restores object spies and rejects calls outside the active attempt', async () => {
    const object = { method: () => 'original' }
    assert.throws(() => runtime.expect(1), /active Next test attempt/)
    begin()
    runtime.spies.spyOn(object, 'method').mockReturnValue('mocked')
    runtime.expect(object.method()).toBe('mocked')
    await scope!.finalize()
    assert.throws(() => runtime.expect(1), /active Next test attempt/)
    await scope!.dispose()
    assert.equal(object.method(), 'original')
  })
})
