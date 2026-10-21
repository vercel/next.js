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
    path.join(os.tmpdir(), 'next-native-after-hooks-')
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
    fileId: 'native-after-hooks-' + mode,
    filePath: path.join(directory, 'file.test.mjs'),
    updateSnapshots: true,
    snapshotBodyFailures: true,
    nativeBeforeEachAssertions: true,
    nativeAfterEachAssertions: mode !== 'default',
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
    const task = primitives.chai.util.flag(assertion, 'vitest-test')
    const thenable = assertion.resolves.toBe(2)
    const promise = task.promises.at(-1)
    assert(promise instanceof Promise)
    assert.notEqual(promise, thenable)
    promises.push(promise)
    if (mode === 'duplicate') task.promises.push(promise)
  }
  try {
    await file.collect(async () => {
      if (mode === 'nonhook')
        file.api.beforeEach(
          (context) => async () => nativeAssertion(context.expect)
        )
      else
        file.api.afterEach(async (context) => nativeAssertion(context.expect))
      for (const name of ['first', 'second'])
        file.api.test(name, ({ expect, onTestFinished, onTestFailed }) => {
          const scope = captureAsyncScope()
          retained = () => scope.run(() => expect('late').toBe('late'))
          expect('owned snapshot').toMatchSnapshot('value')
          onTestFinished(() => listeners.push('finished:' + name))
          onTestFailed(() => listeners.push('failed:' + name))
        })
    })
    const result = await file.run({
      runId: 'native-after-hooks-' + mode,
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
    assert.equal(result.interrupted, mode === 'cancel')
    if (mode === 'pending' || mode === 'released') {
      assert.equal(releases.length, 2)
      assert.equal(events.length, 0)
      if (mode === 'released') file.releaseNativeBodyRejectionRecords()
      releases.forEach((release) => release())
    }
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    const expected =
      mode === 'default' || mode === 'duplicate' || mode === 'nonhook'
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
    assert.deepEqual(listeners, [
      'finished:first',
      'failed:first',
      ...(mode === 'cancel' ? [] : ['finished:second', 'failed:second']),
    ])
    for (const item of result.cases) {
      if (item.status === 'cancelled') {
        assert.equal(mode, 'cancel')
        assert.equal(item.name, 'second')
        assert.deepEqual(item.errors, [])
        continue
      }
      assert.equal(item.status, 'failed')
      const failure = item.errors.find((error) => error.phase === 'assertion')
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
      } else if (['default', 'duplicate', 'nonhook'].includes(mode)) {
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
    assert.throws(retained, /closed attempt scope/)
    assert(late.length > previousLate)
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
