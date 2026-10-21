const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const base = process.argv[2]
const mode = process.argv[3]
const runner = require(path.join(base, 'runner'))
const primitives = require(
  path.join(base, '../../compiled/next-test-primitives')
)

async function main() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'next-native-record-')
  )
  const controller = new AbortController()
  const events = []
  let nativePromise
  let capturedReason
  let borrowed
  let stage = 'collection'
  const observed = mode !== 'default'
  const file = runner.initializeTestFile({
    fileId: 'native-' + mode,
    filePath: path.join(directory, 'file.test.mjs'),
    updateSnapshots: true,
    snapshotBodyFailures: true,
    ...(observed
      ? {
          onUnhandledRejection(reason, promise, recordedBody) {
            const event = events.at(-1)
            assert.equal(event.reason, reason)
            assert.equal(event.promise, promise)
            event.recordedBody = recordedBody
          },
        }
      : {}),
  })
  const onNative = (reason, promise) => {
    capturedReason ??= reason
    const event = {
      reason,
      promise,
      recordedBody: false,
      nativeIdentity: promise === nativePromise,
      stage,
      fields: Object.getOwnPropertyNames(Object(reason)),
    }
    events.push(event)
    runner.routeUnhandledRejection(reason, promise)
    assert.deepEqual(Object.getOwnPropertyNames(Object(reason)), event.fields)
  }
  process.on('unhandledRejection', onNative)
  const nativeAssertion = (context, value) => {
    const assertion = context.expect(value)
    const task = primitives.chai.util.flag(assertion, 'vitest-test')
    const returned = assertion.resolves.toBe(2)
    nativePromise = task.promises.at(-1)
    assert(nativePromise instanceof Promise)
    assert.notEqual(nativePromise, returned)
    return returned
  }
  const snapshot = (context) =>
    context.expect('recorded value').toMatchSnapshot('value')
  try {
    await file.collect(async () => {
      if (mode === 'hook')
        file.api.beforeEach(async (context) => {
          nativeAssertion(context, Promise.resolve(1))
        })
      const sync = (context) => {
        snapshot(context)
        nativeAssertion(context, Promise.resolve(1))
      }
      const asynchronous = async (context) => {
        borrowed = context.expect
        snapshot(context)
        if (mode === 'unknown') {
          Promise.reject(new Error('unregistered native rejection'))
          await new Promise((resolve) => setImmediate(resolve))
          return
        }
        if (mode === 'late') {
          context.onTestFinished(() => {
            setImmediate(() => {
              Promise.resolve().then(() => borrowed(1).toBe(1))
            })
          })
          return
        }
        if (mode === 'cancel' || mode === 'hook') return
        const pending =
          mode === 'pending' || mode === 'pending-timeout'
            ? new Promise((resolve) =>
                mode === 'pending'
                  ? setImmediate(() => resolve(1))
                  : setTimeout(() => resolve(1), 30)
              )
            : Promise.resolve(mode === 'fulfilled' ? 2 : 1)
        const returned = nativeAssertion(context, pending)
        if (mode === 'awaited') await returned
        else if (mode === 'caught') await returned.catch(() => {})
        else if (mode === 'same-error') {
          await new Promise((resolve) => setImmediate(resolve))
          assert(capturedReason)
          Promise.reject(capturedReason)
          await new Promise((resolve) => setImmediate(resolve))
        }
      }
      const body =
        mode === 'sync'
          ? sync
          : mode === 'returned'
            ? (context) => {
                snapshot(context)
                return nativeAssertion(context, Promise.resolve(1))
              }
            : asynchronous
      file.api.test(
        'owned body',
        { timeout: mode === 'pending-timeout' ? 5 : 1000 },
        body
      )
      file.api.test('following body', (context) =>
        context.expect(true).toBe(true)
      )
    })
    stage = 'run'
    const result = await file.run({
      runId: 'native-' + mode,
      signal: controller.signal,
      onCaseEnd() {
        if (mode === 'cancel') controller.abort(new Error('cancel after body'))
      },
    })
    stage = 'dispose'
    await file.dispose()
    stage = 'host-drain'
    await new Promise((resolve) => setImmediate(resolve))
    const expectedEvents = [
      'settled',
      'same-error',
      'unknown',
      'late',
    ].includes(mode)
      ? mode === 'same-error'
        ? 2
        : 1
      : 0
    assert.equal(events.length, expectedEvents, mode)
    if (mode === 'settled') assert.equal(events[0].recordedBody, true)
    if (mode === 'same-error') {
      assert.equal(events[0].reason, events[1].reason)
      assert.notEqual(events[0].promise, events[1].promise)
      assert.deepEqual(
        events.map((event) => event.recordedBody),
        [true, false]
      )
      assert.deepEqual(
        events.map((event) => event.nativeIdentity),
        [true, false]
      )
    }
    if (mode === 'unknown' || mode === 'late')
      assert.equal(events[0].recordedBody, false)
    const veto = [
      'same-error',
      'unknown',
      'late',
      'hook',
      'cancel',
      'pending-timeout',
    ].includes(mode)
    assert.equal(file.canPublishSnapshots(), !veto, mode)
    assert.equal(
      result.interrupted,
      mode === 'cancel' || mode === 'pending-timeout',
      mode
    )
    const caseErrors = result.cases[0].errors.flatMap((failure) =>
      failure.error instanceof AggregateError
        ? failure.error.errors
        : [failure.error]
    )
    if (mode === 'settled' || mode === 'fulfilled')
      assert.equal(caseErrors.length, 1)
    if (mode === 'sync' || mode === 'pending' || mode === 'default')
      assert.equal(caseErrors.length, 2)
    if (mode === 'awaited' || mode === 'returned')
      assert.equal(caseErrors.length, 1)
    if (mode === 'caught') assert.equal(result.cases[0].status, 'passed')
    if (!veto) {
      const updates = file.takeSnapshotUpdates()
      assert.equal(updates.length, 1)
      assert.match(updates[0].content, /recorded value/)
    }
    file.releaseNativeBodyRejectionRecords()
    assert.equal(file.canPublishSnapshots(), false)
    console.log(
      JSON.stringify({
        mode,
        nativeEvents: events.length,
        qualified: !veto,
        actualIdentityHeld: true,
        disposedAndReleased: true,
      })
    )
  } finally {
    await file.dispose()
    file.releaseNativeBodyRejectionRecords()
    process.removeListener('unhandledRejection', onNative)
    await fs.rm(directory, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
