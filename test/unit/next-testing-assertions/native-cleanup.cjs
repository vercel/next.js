const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const base = process.argv[2]
const mode = process.argv[3]
const runner = require(path.join(base, 'runner'))
const { captureAsyncScope } = require(path.join(base, 'runner/async-context'))
const primitives = require(
  path.join(base, '../../compiled/next-test-primitives')
)
async function main() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'next-native-before-each-cleanup-')
  )
  const controller = new AbortController()
  const events = [],
    promises = [],
    late = [],
    listeners = [],
    releases = []
  const external = new Error('external checkpoint failure')
  let retained
  const file = runner.initializeTestFile({
    fileId: 'native-before-each-cleanup-' + mode,
    filePath: path.join(directory, 'file.test.mjs'),
    updateSnapshots: true,
    snapshotBodyFailures: true,
    nativeBeforeEachAssertions: true,
    nativeAfterEachAssertions: true,
    ...(mode === 'default'
      ? {}
      : { nativeBeforeEachCleanupAssertions: mode !== 'false' }),
    onUnhandledRejection(reason, promise, recordedBody) {
      assert.equal(events.at(-1).reason, reason)
      assert.equal(events.at(-1).promise, promise)
      assert.equal(recordedBody, false)
    },
  })
  const observe = (reason, promise) => {
    const own = Object.getOwnPropertyDescriptors(reason)
    events.push({ reason, promise, known: promises.includes(promise) })
    runner.routeUnhandledRejection(reason, promise)
    assert.deepEqual(Object.getOwnPropertyDescriptors(reason), own)
    if (mode === 'same-error' && events.length === 1) Promise.reject(reason)
  }
  process.on('unhandledRejection', observe)
  const nativeAssertion = (expect) => {
    const actual =
      mode === 'pending' || mode === 'released'
        ? new Promise((resolve) => releases.push(() => resolve(1)))
        : Promise.resolve(1)
    const assertion = expect(actual)
    const task = primitives.getVitestAssertionTaskRuntime(
      primitives.chai.util.flag(assertion, 'vitest-test')
    )
    const thenable = assertion.resolves.toBe(2)
    const promise = task.promises.at(-1)
    assert(promise instanceof Promise)
    assert.notEqual(promise, thenable)
    promises.push(promise)
    if (mode === 'duplicate') task.promises.push(promise)
  }
  try {
    await file.collect(async () => {
      let test = file.api.test
      if (mode === 'fixture') {
        const { expect } = require(path.join(base, 'vitest'))
        test = test.extend({
          cleanupValue: async ({}, use) => {
            await use('value')
            nativeAssertion(expect)
          },
        })
        file.api.beforeEach(({ cleanupValue }) =>
          assert.equal(cleanupValue, 'value')
        )
      } else if (mode === 'suite') {
        const { expect } = require(path.join(base, 'vitest'))
        file.api.beforeAll(async () => nativeAssertion(expect))
      } else if (mode === 'listener') {
        file.api.beforeEach((context) => {
          context.onTestFinished(() => nativeAssertion(context.expect))
        })
      } else {
        file.api.beforeEach((context) => async () => {
          nativeAssertion(context.expect)
          if (mode === 'cleanup-mixed')
            context.expect.soft('cleanup').toBe('other')
        })
      }
      for (const name of ['first', 'second'])
        test(name, ({ expect, onTestFinished, onTestFailed }) => {
          const scope = captureAsyncScope()
          retained = () => scope.run(() => expect('late').toBe('late'))
          expect('owned snapshot').toMatchSnapshot('value')
          if (mode === 'body-mixed') expect.soft('body').toBe('other')
          onTestFinished(() => listeners.push('finished:' + name))
          onTestFailed(() => listeners.push('failed:' + name))
        })
    })
    const result = await file.run({
      runId: 'native-before-each-cleanup-' + mode,
      signal: controller.signal,
      onLateFailure(error) {
        late.push(error)
      },
      onCaseEnd() {
        if (mode === 'cancel') controller.abort(new Error('cancel after first'))
      },
      ...(mode === 'external'
        ? {
            beginAttempt() {
              return {
                checkpoint() {
                  throw external
                },
                async finalize() {},
                async dispose() {},
              }
            },
          }
        : {}),
    })
    await file.dispose()
    assert.equal(file.canPublishSnapshots(), false)
    assert.equal(file.hasCompletedBodyExecution(), false)
    if (mode !== 'suite') assert.equal(result.interrupted, mode === 'cancel')
    if (mode === 'pending' || mode === 'released') {
      assert.equal(releases.length, 2)
      assert.equal(events.length, 0)
      if (mode === 'released') file.releaseNativeBodyRejectionRecords()
      releases.forEach((release) => release())
    }
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    const expected = [
      'default',
      'false',
      'duplicate',
      'fixture',
      'listener',
      'suite',
    ].includes(mode)
      ? 0
      : mode === 'same-error'
        ? 3
        : mode === 'cancel'
          ? 1
          : 2
    assert.equal(events.length, expected)
    assert.equal(
      events.filter((event) => event.known).length,
      mode === 'same-error' ? 2 : expected
    )
    if (mode === 'same-error') {
      const unknown = events.find((event) => !event.known)
      assert.equal(events[0].reason, unknown.reason)
      assert.notEqual(events[0].promise, unknown.promise)
    }
    assert.equal(
      late.length,
      mode === 'same-error' ? 1 : mode === 'released' ? 2 : 0
    )
    assert.deepEqual(
      listeners,
      mode === 'suite'
        ? []
        : [
            'finished:first',
            'failed:first',
            ...(mode === 'cancel' ? [] : ['finished:second', 'failed:second']),
          ]
    )
    for (const item of result.cases) {
      if (mode === 'suite') {
        assert.equal(item.status, 'skipped')
        assert(result.errors.length > 0)
        continue
      }
      if (item.status === 'cancelled') {
        assert.equal(mode, 'cancel')
        assert.equal(item.name, 'second')
        assert.deepEqual(item.errors, [])
        continue
      }
      assert.equal(item.status, 'failed')
      const assertions = item.errors.filter(
        (error) => error.phase === 'assertion'
      )
      if (mode === 'body-mixed') {
        assert.equal(assertions.length, 2)
        assert.equal(assertions[0].error.name, 'AssertionError')
        assert.equal(
          assertions[0].error.message,
          "expected 'body' to be 'other' // Object.is equality"
        )
      }
      const failure = assertions[mode === 'body-mixed' ? 1 : 0]
      assert(failure, mode)
      assert(failure.error instanceof AggregateError)
      if (mode === 'external') {
        assert.equal(
          failure.error.message,
          'Attempt assertion checkpoint failed'
        )
        assert.equal(failure.error.errors.length, 2)
        assert(failure.error.errors[0] instanceof AggregateError)
        assert.equal(failure.error.errors[1], external)
      } else if (
        [
          'default',
          'false',
          'duplicate',
          'fixture',
          'listener',
          'cleanup-mixed',
        ].includes(mode)
      ) {
        assert.equal(
          failure.error.message,
          'Attempt assertion checkpoint failed'
        )
        assert(failure.error.errors[0] instanceof AggregateError)
      } else {
        assert.equal(failure.error.message, 'Test assertions failed')
        assert.equal(failure.error.errors.length, 1)
        assert.match(failure.error.errors[0].message, /was not awaited/)
      }
    }
    const previousLate = late.length
    if (retained) {
      assert.throws(retained, /closed attempt scope/)
      assert(late.length > previousLate)
    }
    file.releaseNativeBodyRejectionRecords()
    assert.equal(file.hasCompletedBodyExecution(), false)
    console.log(
      JSON.stringify({
        mode,
        actualNativeEvents: events.length,
        originalPromiseIdentities: true,
        checkpointForwardingStrict: true,
        pendingLifetimeHeld: true,
        listenerOwnershipHeld: true,
        bodyPublicationRefused: true,
        closedScopeRefused: true,
        disposedAndReleased: true,
      })
    )
  } finally {
    releases.forEach((release) => release())
    await file.dispose()
    file.releaseNativeBodyRejectionRecords()
    process.removeListener('unhandledRejection', observe)
    await fs.rm(directory, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
