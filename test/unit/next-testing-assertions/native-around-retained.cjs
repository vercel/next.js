const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const base = process.argv[2]
const mode = process.argv[3]
const { createAssertionRuntime } = require(path.join(base, 'assertions'))
const asyncScopes = require(path.join(base, 'runner/async-context'))
const runner = require(path.join(base, 'runner'))
const { chai } = require(path.join(base, '../../compiled/next-test-primitives'))
async function main() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'next-around-retained-')
  )
  const late = [],
    native = [],
    routed = []
  let runtime,
    outer,
    outerHandle,
    child,
    childHandle,
    release,
    promise,
    retained
  const observe = (reason, eventPromise) => {
    const own = Object.getOwnPropertyDescriptors(reason)
    native.push({ reason, promise: eventPromise })
    runner.routeUnhandledRejection(reason, eventPromise)
    assert.deepEqual(Object.getOwnPropertyDescriptors(reason), own)
  }
  process.on('unhandledRejection', observe)
  try {
    runtime = await createAssertionRuntime({
      testPath: path.join(directory, 'subject.mjs'),
      observeNativeUnhandledAssertions: true,
      observeNativeAfterEachAssertions: true,
      getCurrentAttempt: asyncScopes.getOriginatingAttempt,
      getCurrentCasePhase: asyncScopes.getOriginatingCasePhase,
      getCurrentHook: asyncScopes.getOriginatingHook,
      getCurrentScopeAncestors: asyncScopes.getOriginatingScopeAncestors,
    })
    outer = asyncScopes.createAsyncScope(
      {
        kind: 'hook',
        context: {
          id: 'around',
          fileId: 'file',
          name: 'around',
          hook: 'aroundAll',
        },
      },
      (error) => late.push(error)
    )
    outerHandle = outer.run(() =>
      runtime.beginHook({
        id: 'around',
        fileId: 'file',
        name: 'around',
        hook: 'aroundAll',
      })
    )
    const execute = () =>
      outer.run(async () => {
        runtime.expect.assertions(2)
        runtime.expect('before').toBe('before')
        await outerHandle.suspend(async () => {
          const context = {
            id: 'child',
            testId: 'test',
            fileId: 'file',
            name: 'child',
          }
          child = asyncScopes.createAsyncScope(
            { kind: 'attempt', context },
            (error) => late.push(error),
            (reason, eventPromise) => {
              const recognized = runtime.observeNativeHookRejection(
                reason,
                eventPromise
              )
              routed.push({ reason, promise: eventPromise, recognized })
            }
          )
          childHandle = child.run(() => runtime.beginAttempt(context))
          await child.run(async () => {
            const owned = asyncScopes.captureAsyncScope()
            retained = () => owned.run(() => runtime.expect(true).toBe(true))
            runtime.expect('body').toBe('body')
            await childHandle.finishTest(false)
            if (mode === 'native') {
              asyncScopes.runWithCasePhase(
                'afterEach',
                () => {
                  const assertion = runtime.expect(
                    new Promise((resolve) => {
                      release = () => resolve(1)
                    })
                  )
                  const task = chai.util.flag(assertion, 'vitest-test')
                  const thenable = assertion.resolves.toBe(2)
                  promise = task.promises.at(-1)
                  assert(promise instanceof Promise)
                  assert.notEqual(promise, thenable)
                },
                true
              )
              let failure
              try {
                await childHandle.checkpoint()
              } catch (error) {
                failure = error
              }
              assert(failure instanceof AggregateError)
              assert.equal(
                childHandle.consumeNativeHookCheckpointFailure(failure),
                true
              )
            }
            if (mode !== 'active') await childHandle.finalize()
            if (mode === 'disposed' || mode === 'native')
              await childHandle.dispose()
          })
          if (mode === 'disposed' || mode === 'native') child.close()
        })
        runtime.expect('after').toBe('after')
        await outerHandle.finalize()
        await outerHandle.dispose()
      })
    if (mode === 'active' || mode === 'finalized') {
      await assert.rejects(
        execute,
        /Cannot resume aroundAll assertions before inner scopes are disposed/
      )
      console.log(JSON.stringify({ mode, actualUnclosedChildRefused: true }))
    } else {
      await execute()
      assert.throws(retained, /closed attempt scope/)
      if (mode === 'native') {
        await runtime.finishFile()
        release()
        await new Promise((resolve) => setImmediate(resolve))
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(native.length, 1)
        assert.equal(native[0].promise, promise)
        assert.equal(routed.length, 1)
        assert.equal(routed[0].promise, promise)
        assert.equal(routed[0].reason, native[0].reason)
        assert.equal(routed[0].recognized, true)
        assert.equal(runtime.hasCompleteNativeBodyRejections(), false)
      }
      console.log(
        JSON.stringify({
          mode,
          disposedChildResumed: true,
          closedScopeRefused: true,
          actualNativeEvents: native.length,
          exactRetainedNativeOwner: mode === 'native',
          nativeAfterFileFinish: mode === 'native',
          bodyPublicationRefused: mode === 'native',
        })
      )
    }
  } finally {
    if (release) release()
    if (child && childHandle)
      await child.run(() => childHandle.dispose()).catch(() => {})
    child?.close()
    outer?.close()
    await runtime?.finishFile()
    runtime?.releaseNativeBodyRejectionRecords()
    process.removeListener('unhandledRejection', observe)
    await fs.rm(directory, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
