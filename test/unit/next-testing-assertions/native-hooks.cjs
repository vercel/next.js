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
    path.join(os.tmpdir(), 'next-native-hooks-')
  )
  const controller = new AbortController()
  const events = [],
    promises = [],
    late = [],
    listeners = []
  let retained
  const file = runner.initializeTestFile({
    fileId: 'native-hooks-' + mode,
    filePath: path.join(directory, 'file.test.mjs'),
    updateSnapshots: true,
    snapshotBodyFailures: true,
    nativeBeforeEachAssertions: mode !== 'default',
    onUnhandledRejection(reason, promise, recordedBody) {
      const event = events.at(-1)
      assert.equal(event.reason, reason)
      assert.equal(event.promise, promise)
      assert.equal(recordedBody, false)
    },
  })
  const observe = (reason, promise) => {
    const event = {
      reason,
      promise,
      ownKeys: Reflect.ownKeys(reason),
      known: promises.includes(promise),
    }
    events.push(event)
    runner.routeUnhandledRejection(reason, promise)
    assert.deepEqual(Reflect.ownKeys(reason), event.ownKeys)
    if (mode === 'same-error' && events.length === 1) Promise.reject(reason)
  }
  process.on('unhandledRejection', observe)
  const nativeAssertion = (expect) => {
    const assertion = expect(Promise.resolve(1))
    const task = primitives.chai.util.flag(assertion, 'vitest-test')
    const thenable = assertion.resolves.toBe(2)
    const promise = task.promises.at(-1)
    assert(promise instanceof Promise)
    assert.notEqual(promise, thenable)
    promises.push(promise)
  }
  try {
    await file.collect(async () => {
      let test = file.api.test
      if (mode === 'fixture') {
        const { expect } = require(path.join(base, 'vitest'))
        test = test.extend({
          hookValue: async ({}, use) => {
            nativeAssertion(expect)
            await use('value')
          },
        })
        file.api.beforeEach(({ hookValue }) => assert.equal(hookValue, 'value'))
      } else if (mode === 'cleanup') {
        file.api.beforeEach(
          (context) => async () => nativeAssertion(context.expect)
        )
      } else {
        file.api.beforeEach(async (context) => nativeAssertion(context.expect))
      }
      for (const name of ['first', 'second'])
        test(name, ({ expect, onTestFinished, onTestFailed }) => {
          const scope = captureAsyncScope()
          retained = () => scope.run(() => expect('late').toBe('late'))
          expect('owned snapshot').toMatchSnapshot('value')
          onTestFinished(() => listeners.push('finished:' + name))
          onTestFailed(() => listeners.push('failed:' + name))
        })
    })
    const result = await file.run({
      runId: 'native-hooks-' + mode,
      signal: controller.signal,
      onLateFailure(error) {
        late.push(error)
      },
      onCaseEnd() {
        if (mode === 'cancel') controller.abort(new Error('cancel after first'))
      },
    })
    await file.dispose()
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    const expected =
      mode === 'hook'
        ? 2
        : mode === 'same-error'
          ? 3
          : mode === 'cancel'
            ? 1
            : 0
    assert.equal(events.length, expected)
    assert.equal(
      events.filter((event) => event.known).length,
      mode === 'same-error' ? 2 : expected
    )
    if (mode === 'same-error') {
      const unknown = events.find((event) => !event.known)
      assert.equal(events[0].reason, unknown.reason)
      assert.notEqual(events[0].promise, unknown.promise)
      assert.equal(late.length, 1)
    } else assert.equal(late.length, 0)
    assert.deepEqual(listeners, [
      'finished:first',
      'failed:first',
      ...(mode === 'cancel' ? [] : ['finished:second', 'failed:second']),
    ])
    assert.equal(file.canPublishSnapshots(), false)
    assert.equal(file.hasCompletedBodyExecution(), false)
    assert.equal(result.interrupted, mode === 'cancel')
    const priorLate = late.length
    assert.throws(retained, /closed attempt scope/)
    assert(late.length > priorLate)
    file.releaseNativeBodyRejectionRecords()
    assert.equal(file.hasCompletedBodyExecution(), false)
    console.log(
      JSON.stringify({
        mode,
        actualNativeEvents: events.length,
        originalPromiseIdentities: true,
        listenerOwnershipHeld: true,
        bodyPublicationRefused: true,
        closedScopeRefused: true,
        disposedAndReleased: true,
      })
    )
  } finally {
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
