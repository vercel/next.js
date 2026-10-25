const assert = require('node:assert/strict')
const mode = process.argv[2]
const {
  initializeTestFile,
  getAssertionRuntime,
  getCurrentTest,
  getConsoleTask,
} = require('next/dist/experimental/testing/runner')
const {
  captureAsyncScope,
} = require('next/dist/experimental/testing/runner/async-context')
assert(
  ['default', 'ordered', 'before-error', 'worker-error', 'mixed-same'].includes(
    mode
  )
)
async function main() {
  const trace = [],
    beforeError = new Error('actual before-worker cleanup failed'),
    workerError =
      mode === 'mixed-same'
        ? beforeError
        : new Error('actual worker fixture cleanup failed')
  let captured,
    assertionRuntime,
    originalFinish,
    finishDescriptor,
    finishCalled = false,
    release,
    entered
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const started = new Promise((resolve) => {
    entered = resolve
  })
  const file = initializeTestFile({
    fileId: 'native-order-' + mode,
    filePath: '/native-order.test.mjs',
    resourceLifetime: 'file',
    updateSnapshots: true,
  })
  file.enableBrowserPublicTaskQueues()
  try {
    await file.collect(() => {
      assertionRuntime = getAssertionRuntime()
      const test = file.api.test.extend({
        resource: [
          async ({}, use) => {
            captured = captureAsyncScope()
            trace.push('setup')
            await use(1)
            captured.run(() => {
              assert.equal(getAssertionRuntime(), assertionRuntime)
              assert.equal(finishCalled, false)
              trace.push('worker-live')
            })
            trace.push('worker-cleanup')
            if (mode === 'worker-error' || mode === 'mixed-same')
              throw workerError
          },
          { scope: 'worker' },
        ],
      })
      test('body', ({ resource }) => {
        assert.equal(resource, 1)
        trace.push('body')
      })
    })
    finishDescriptor = Object.getOwnPropertyDescriptor(
      assertionRuntime,
      'finishFile'
    )
    originalFinish = assertionRuntime.finishFile
    Object.defineProperty(assertionRuntime, 'finishFile', {
      ...finishDescriptor,
      value: function (...args) {
        finishCalled = true
        trace.push('assertions-finish')
        return Reflect.apply(originalFinish, this, args)
      },
    })
    const result = await file.run({
      signal: new AbortController().signal,
      testTimeout: 1000,
      hookTimeout: 1000,
    })
    assert.deepEqual(
      result.cases.map((test) => test.status),
      ['passed']
    )
    assert.equal(result.errors.length, 0)
    const disposing = file.dispose(
      mode === 'default'
        ? undefined
        : {
            beforeOwnedWorkerDispose: async () => {
              assert.equal(getCurrentTest(), undefined)
              assert.equal(getConsoleTask(), undefined)
              captured.run(() =>
                assert.equal(getAssertionRuntime(), assertionRuntime)
              )
              assert.equal(finishCalled, false)
              trace.push('before-start')
              entered()
              await gate
              trace.push('before-end')
              if (mode === 'before-error' || mode === 'mixed-same')
                throw beforeError
            },
          }
    )
    const outcome = disposing.then(
      () => undefined,
      (error) => error
    )
    if (mode !== 'default') {
      await started
      assert.equal(trace.includes('worker-cleanup'), false)
      assert.equal(finishCalled, false)
      release()
    }
    const error = await outcome
    assert.deepEqual(trace, [
      'setup',
      'body',
      ...(mode === 'default' ? [] : ['before-start', 'before-end']),
      'worker-live',
      'worker-cleanup',
      'assertions-finish',
    ])
    assert.equal(finishCalled, true)
    if (mode === 'mixed-same') {
      assert(error instanceof AggregateError)
      assert.deepEqual(error.errors, [beforeError, workerError])
      assert.equal(error.errors[0], error.errors[1])
    } else
      assert.equal(
        error,
        mode === 'before-error'
          ? beforeError
          : mode === 'worker-error'
            ? workerError
            : undefined
      )
    assert.throws(() => captured.run(() => {}), /closed/)
    if (error) assert.throws(() => file.takeSnapshotUpdates())
    process.stdout.write(
      JSON.stringify({
        mode,
        actualOwnedWorkerBoundary: true,
        callbackAwaitedBeforeWorker: true,
        assertionAndWorkerLifetimesHeld: true,
        allFailureSlotsPreserved: true,
        closedAfterJoin: true,
      }) + '\n'
    )
  } finally {
    release()
    if (assertionRuntime && finishDescriptor)
      Object.defineProperty(assertionRuntime, 'finishFile', finishDescriptor)
    await file.dispose().catch(() => {})
  }
}
main().catch((error) => {
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
