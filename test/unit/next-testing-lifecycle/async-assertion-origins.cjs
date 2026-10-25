const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const runner = require('next/dist/experimental/testing/runner')
const facade = require('next/dist/experimental/testing/vitest')
const primitive = require('next/dist/compiled/next-test-primitives')
const {
  createAsyncScope,
  runWithCasePhase,
} = require('next/dist/experimental/testing/runner/async-context')
const directory = mkdtempSync(join(tmpdir(), 'next-async-assertion-origins-'))
const events = []
const results = []
const checkpoint = () => new Promise(setImmediate)
const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function onUnhandled(reason, promise) {
  events.push({ reason, promise })
  runner.routeUnhandledRejection(reason, promise)
}
process.on('unhandledRejection', onUnhandled)

async function capturedObserver() {
  const target = { type: 'test', promises: [], onFinished: [] }
  const privateTarget = { promises: [], onFinished: [] }
  const value = deferred()
  const first = { promises: [], checks: [], recorded: 0, settled: 0 }
  const later = { promises: [], checks: [], recorded: 0, settled: 0 }
  const observe = (owner) => ({
    recorded(promise) {
      owner.recorded++
      owner.promises.push(promise)
    },
    settled(promise) {
      owner.settled++
      const index = owner.promises.indexOf(promise)
      assert.notEqual(index, -1)
      owner.promises.splice(index, 1)
    },
    finished(promise, check) {
      owner.checks.push({ promise, check })
    },
  })
  let selected = observe(first)
  let captures = 0
  primitive.registerVitestAssertionTaskRuntime(target, privateTarget, {
    ...observe(later),
    capture() {
      captures++
      return selected
    },
  })
  const assertion = primitive.recordAsyncExpect(
    target,
    value.promise,
    'expect(actual).resolves.toBe(expected)',
    new Error('registration'),
    false
  )
  assert.equal(captures, 1)
  assert.equal(target.promises.length, 1)
  assert.equal(first.promises[0], target.promises[0])
  assert.equal(target.onFinished[0], first.checks[0].check)
  assert.equal(first.checks[0].promise, target.promises[0])
  assert.deepEqual(privateTarget, { promises: [], onFinished: [] })
  selected = observe(later)
  value.resolve(7)
  assert.equal(await assertion, 7)
  assert.equal(captures, 1)
  assert.equal(first.recorded, 1)
  assert.equal(first.settled, 1)
  assert.deepEqual(first.promises, [])
  assert.equal(later.recorded, 0)
  assert.equal(later.settled, 0)
  assert.deepEqual(later.checks, [])
  target.onFinished[0]()
  results.push('captured-once-before-settlement')
}

async function absentObserver(name) {
  const target = { type: 'test' }
  const privateTarget = { promises: [], onFinished: [] }
  const failure = new Error(name)
  const start = events.length
  let captures = 0
  const forbidden = () => assert.fail('No real origin granted an observer')
  primitive.registerVitestAssertionTaskRuntime(target, privateTarget, {
    recorded: forbidden,
    settled: forbidden,
    finished: forbidden,
    capture() {
      captures++
      return undefined
    },
  })
  primitive.recordAsyncExpect(
    target,
    Promise.reject(failure),
    'expect(actual).resolves.toBe(expected)',
    new Error('registration'),
    false
  )
  const actualPromise = target.promises[0]
  target.promises = []
  await checkpoint()
  assert.equal(captures, 1)
  assert.equal(events.length, start + 1)
  assert.equal(events[start].promise, actualPromise)
  assert.equal(events[start].reason, failure)
  assert.deepEqual(privateTarget, { promises: [], onFinished: [] })
  assert.equal(target.onFinished.length, 1)
  assert.throws(target.onFinished[0], /was not awaited/)
  results.push(name)
}

async function actualScope(kind) {
  const entered = deferred()
  const registered = deferred()
  const handshake = deferred()
  const finished = deferred()
  const value = deferred()
  const native = []
  const origins = []
  let first, second, firstPrivate, secondPrivate, consume
  let actualPromise
  const local = kind === 'deleted-local'
  const passing = kind === 'awaited-global'
  const start = events.length
  const file = runner.initializeTestFile({
    publicTaskSelection: true,
    fileId: kind,
    filePath: join(directory, kind + '.test.mjs'),
    snapshotBodyFailures: true,
    onUnhandledRejection(reason, promise, body) {
      native.push({ reason, promise, body })
    },
  })
  try {
    await file.collect(async () => {
      facade.afterEach((context) => {
        if (context.task.name === 'second') setImmediate(finished.resolve)
      })
      facade.expect.extend({
        async toOwned(received, expected) {
          const origin = runner.getActiveAttempt()
          origins.push(origin.id)
          assert.equal(origin.testId, first.task.id)
          await Promise.resolve()
          assert.equal(runner.getActiveAttempt(), origin)
          origins.push(runner.getActiveAttempt().id)
          return {
            pass: received === expected,
            message: () => 'actual async matcher mismatch',
          }
        },
      })
      facade.test.concurrent('first', async (context) => {
        first = context
        firstPrivate = primitive.getVitestAssertionTaskRuntime(context.task)
        await entered.promise
        const origin = runner.getActiveAttempt()
        const assertion = (local ? context.expect : facade.expect)(
          value.promise
        )
        assert.equal(
          facade.chai.util.flag(assertion, 'vitest-test'),
          local ? first.task : second.task
        )
        consume = assertion.resolves.toOwned('wanted')
        assert.equal(runner.getActiveAttempt(), origin)
        assert.equal(firstPrivate.promises.length, 1)
        assert.equal(secondPrivate.promises.length, 0)
        actualPromise = (local ? first : second).task.promises[0]
        assert.equal(firstPrivate.promises[0], actualPromise)
        registered.resolve()
        await handshake.promise
        value.resolve(passing ? 'wanted' : 'wrong')
        if (passing) await consume
        await finished.promise
        assert.equal(runner.getActiveAttempt(), origin)
      })
      facade.test.concurrent('second', async (context) => {
        second = context
        secondPrivate = primitive.getVitestAssertionTaskRuntime(context.task)
        entered.resolve()
        await registered.promise
        if (!passing) (local ? first : second).task.promises = []
        handshake.resolve()
        if (passing) await consume
      })
    })
    const result = await file.run({
      runId: kind,
      signal: new AbortController().signal,
      captureCompletedModuleResult: true,
    })
    await checkpoint()
    assert.ok(origins.length >= 2)
    assert.ok(origins.every((id) => id === origins[0]))
    const cases = new Map(result.cases.map((test) => [test.name, test.status]))
    assert.equal(cases.get('first'), passing || !local ? 'passed' : 'failed')
    assert.equal(cases.get('second'), passing || local ? 'passed' : 'failed')
    if (passing) {
      assert.equal(events.length, start)
      assert.deepEqual(native, [])
    } else {
      assert.equal(events.length, start + 1)
      assert.equal(events[start].promise, actualPromise)
      assert.equal(native.length, 1)
      assert.equal(native[0].reason, events[start].reason)
      assert.equal(native[0].promise, actualPromise)
      assert.equal(native[0].body, true)
    }
    const bodies = file.getNativeBodySettlement()
    assert.equal(bodies.invocations.length, 2)
    assert.ok(bodies.invocations.every((body) => body.settled))
  } finally {
    await file.dispose()
  }
  if (kind === 'deleted-global') {
    assert.equal(file.hasCompletedBodyExecution(), false)
  }
  results.push(kind)
}

async function absentRealOrigin(retired) {
  const name = retired ? 'retired-origin' : 'no-origin'
  const ready = deferred()
  const queued = deferred()
  const reported = deferred()
  const failure = new Error(name)
  const start = events.length
  const native = []
  let first, second, firstPrivate, secondPrivate, actualPromise, callbackError
  const file = runner.initializeTestFile({
    publicTaskSelection: true,
    fileId: name,
    filePath: join(directory, name + '.test.mjs'),
    snapshotBodyFailures: true,
    onUnhandledRejection(reason, promise, body) {
      native.push({ reason, promise, body })
    },
  })
  function register() {
    primitive.recordAsyncExpect(
      second.task,
      Promise.reject(failure),
      'expect(actual).resolves.toBe(expected)',
      new Error('registration'),
      false
    )
    actualPromise = second.task.promises[0]
    assert.equal(second.task.onFinished.length, 1)
    assert.equal(secondPrivate.promises.length, 0)
    if (firstPrivate) assert.equal(firstPrivate.promises.length, 0)
    queued.resolve()
  }
  try {
    await file.collect(async () => {
      if (retired)
        facade.test.concurrent('first', (context) => {
          first = context
          firstPrivate = primitive.getVitestAssertionTaskRuntime(context.task)
          setImmediate(() => {
            void (async () => {
              await reported.promise
              assert.equal(first.task.result.state, 'pass')
              register()
            })().catch((error) => {
              callbackError = error
              queued.resolve()
            })
          })
        })
      facade.test.concurrent('second', async (context) => {
        second = context
        secondPrivate = primitive.getVitestAssertionTaskRuntime(context.task)
        ready.resolve()
        await queued.promise
        second.task.promises = []
        await checkpoint()
      })
    })
    const running = file.run({
      runId: name,
      signal: new AbortController().signal,
      captureCompletedModuleResult: true,
      onCaseResult(task) {
        if (task.name === 'first') reported.resolve()
      },
    })
    await ready.promise
    if (!retired) {
      assert.equal(runner.getActiveAttempt(), undefined)
      register()
    }
    const result = await running
    await checkpoint()
    assert.equal(callbackError, undefined)
    assert.equal(events.length, start + 1)
    assert.equal(events[start].reason, failure)
    assert.equal(events[start].promise, actualPromise)
    assert.equal(secondPrivate.promises.length, 0)
    if (retired) {
      assert.equal(native.length, 1)
      assert.equal(native[0].reason, failure)
      assert.equal(native[0].promise, actualPromise)
      assert.equal(native[0].body, false)
      assert.deepEqual(
        result.errors.map((error) => error.error),
        [failure]
      )
    } else {
      assert.deepEqual(native, [])
      assert.deepEqual(result.errors, [])
    }
    assert.equal(
      result.cases.find((test) => test.name === 'second').status,
      'failed'
    )
  } finally {
    await file.dispose()
  }
  assert.equal(file.hasCompletedBodyExecution(), false)
  results.push(name + '-remains-unhandled')
}

async function collidingOrigin() {
  const failure = new Error('colliding-id raw rejection')
  const start = events.length
  const native = []
  let actualPromise
  const file = runner.initializeTestFile({
    publicTaskSelection: true,
    fileId: 'colliding',
    filePath: join(directory, 'colliding.test.mjs'),
    snapshotBodyFailures: true,
    onUnhandledRejection(reason, promise, body) {
      native.push({ reason, promise, body })
    },
  })
  try {
    await file.collect(async () => {
      facade.test('actual', async (context) => {
        const actual = runner.getActiveAttempt()
        const fake = { ...actual }
        const privateTask = primitive.getVitestAssertionTaskRuntime(
          context.task
        )
        const scope = createAsyncScope(
          { kind: 'attempt', context: fake },
          (error) => {
            throw error
          }
        )
        try {
          scope.run(() =>
            runWithCasePhase('test', () => {
              assert.notEqual(runner.getActiveAttempt(), actual)
              assert.equal(runner.getActiveAttempt().id, actual.id)
              primitive.recordAsyncExpect(
                context.task,
                Promise.reject(failure),
                'expect(actual).resolves.toBe(expected)',
                new Error('registration'),
                false
              )
              actualPromise = context.task.promises[0]
              assert.equal(context.task.promises.length, 1)
              assert.equal(context.task.onFinished.length, 1)
              assert.equal(privateTask.promises.length, 0)
              context.task.promises = []
            })
          )
          assert.equal(runner.getActiveAttempt(), actual)
          await checkpoint()
        } finally {
          scope.close()
        }
      })
    })
    const result = await file.run({
      runId: 'colliding',
      signal: new AbortController().signal,
      captureCompletedModuleResult: true,
    })
    await checkpoint()
    assert.equal(events.length, start + 1)
    assert.equal(events[start].promise, actualPromise)
    assert.equal(events[start].reason, failure)
    assert.equal(native.length, 1)
    assert.equal(native[0].promise, actualPromise)
    assert.equal(native[0].reason, failure)
    assert.equal(native[0].body, false)
    assert.deepEqual(
      result.errors.map((error) => error.error),
      [failure]
    )
  } finally {
    await file.dispose()
  }
  assert.equal(file.hasCompletedBodyExecution(), false)
  results.push('colliding-id-remains-unhandled')
}

async function main() {
  try {
    await capturedObserver()
    await absentObserver('capture-undefined-remains-unhandled')
    await absentRealOrigin(false)
    await absentRealOrigin(true)
    await collidingOrigin()
    for (const kind of ['awaited-global', 'deleted-global', 'deleted-local']) {
      await actualScope(kind)
    }
    console.log(JSON.stringify(results))
  } finally {
    process.off('unhandledRejection', onUnhandled)
    rmSync(directory, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
