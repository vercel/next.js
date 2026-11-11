const assert = require('node:assert/strict')
const { initializeTestFile } = require('next/dist/experimental/testing/runner')
const scopes = require('next/dist/experimental/testing/client/async-context')
const mode = process.argv[2]
assert(['fulfilled', 'rejected', 'native-reject', 'legacy'].includes(mode))
async function main() {
  const file = initializeTestFile({
    fileId: 'cleanup-invocation-' + mode,
    filePath: '/cleanup-invocation.test.mjs',
  })
  const late = [],
    failure = new Error('original cleanup or native failure'),
    target = {}
  let invocation,
    admission,
    operation,
    lease,
    callbackCalls = 0,
    release
  const gate = new Promise((resolve, reject) => {
    release = () => (mode === 'native-reject' ? reject(failure) : resolve())
  })
  const operationOutcome = gate.then(
    () => ({ status: 'fulfilled' }),
    (error) => ({ status: 'rejected', error })
  )
  const owner = scopes.createAsyncScope(
    {
      kind: 'attempt',
      context: {
        id: 'closed-creator',
        testId: 'case',
        fileId: 'file',
        name: 'case',
        retry: 0,
        repeat: 0,
        signal: new AbortController().signal,
      },
    },
    (error) => late.push(error)
  )
  const cell = owner.run(() => scopes.captureCreatorScope())
  owner.close()
  assert.equal(file.captureOwnedBeforeWorkerInvocation(), undefined)
  try {
    await file.collect(() => file.api.test('body', () => {}))
    await file.run({ signal: new AbortController().signal, testTimeout: 1000 })
    const result = await file
      .dispose(
        mode === 'legacy'
          ? undefined
          : {
              beforeOwnedWorkerDispose: async function () {
                callbackCalls++
                assert.equal(arguments.length, 0)
                invocation = file.captureOwnedBeforeWorkerInvocation()
                assert.equal(Object.isFrozen(invocation), true)
                assert.equal(
                  file.captureOwnedBeforeWorkerInvocation(),
                  invocation
                )
                invocation.assertActive()
                lease = scopes.createDefaultKeyboardCleanupCall(
                  target,
                  invocation
                )
                lease.run(() => {
                  const leave = scopes.enterCreatorScope(cell)
                  try {
                    scopes.assertBrowserApiScope('browser-native')
                    for (const kind of ['assertion', 'utility', 'declaration'])
                      assert.throws(
                        () => scopes.assertBrowserApiScope(kind),
                        /closed attempt/
                      )
                    admission = scopes.captureClientResourceCommandAdmission()
                    assert.equal(admission.origin, undefined)
                    operation = gate
                    admission.bind(operation)
                    assert.throws(
                      () => admission.bind(operation),
                      /already bound/
                    )
                    assert.equal(
                      admission.query(operation, () => 42),
                      42
                    )
                    assert.throws(
                      () => admission.query(Promise.resolve(), () => 0),
                      /Invalid.*operation/
                    )
                  } finally {
                    leave()
                  }
                })
                if (mode === 'rejected') throw failure
              },
            }
      )
      .then(
        () => ({ status: 'fulfilled' }),
        (error) => ({ status: 'rejected', error })
      )
    assert.equal(file.captureOwnedBeforeWorkerInvocation(), undefined)
    if (mode === 'legacy') {
      assert.equal(callbackCalls, 0)
      assert.equal(invocation, undefined)
      release()
    } else {
      assert.equal(callbackCalls, 1)
      assert.throws(
        () => invocation.assertActive(),
        /active file disposal invocation/
      )
      assert.equal(
        admission.query(operation, () => 43),
        43
      )
      lease.run(() =>
        assert.throws(
          () => scopes.assertBrowserApiScope('browser-native'),
          /active file disposal invocation/
        )
      )
      lease.close()
      lease.run(() =>
        assert.throws(
          () => scopes.captureClientResourceCommandAdmission(),
          /Late default Browser keyboard cleanup invocation/
        )
      )
      assert.equal(
        admission.query(operation, () => 44),
        44
      )
      release()
      const original = await operationOutcome
      assert.equal(
        original.status,
        mode === 'native-reject' ? 'rejected' : 'fulfilled'
      )
      if (mode === 'native-reject') assert.equal(original.error, failure)
      admission.finish(operation)
      assert.throws(
        () => admission.query(operation, () => 0),
        /Invalid.*operation/
      )
      assert.throws(() => admission.finish(operation), /Invalid.*operation/)
    }
    if (mode === 'rejected') assert.equal(result.error, failure)
    else assert.equal(result.status, 'fulfilled')
    const unowned = scopes.createDefaultKeyboardCleanupCall(target)
    unowned.run(() =>
      assert.equal(scopes.captureClientResourceCommandAdmission(), undefined)
    )
    unowned.close()
    process.stdout.write(
      JSON.stringify({
        mode,
        actualFileInvocationOnly: true,
        callbackZeroArgsAndJoined: true,
        closedCreatorOtherApisHeld: true,
        newStartClosesButPendingQueryFinishes: true,
        originalNativeRejectionHeld: true,
        originAbsent: true,
      }) + '\n'
    )
  } finally {
    release()
    lease?.close()
    await file.dispose().catch(() => {})
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
