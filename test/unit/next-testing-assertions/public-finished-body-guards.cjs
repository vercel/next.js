const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os')
const runner = require(process.argv[2])
async function main() {
  const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'next-public-finished-body-guards-')
    ),
    file = runner.initializeTestFile({
      fileId: 'actual-public-finished-guards',
      filePath: path.join(dir, 'actual.test.mjs'),
      snapshotBodyFailures: true,
      nativeBeforeEachAssertions: true,
      nativeAfterEachAssertions: true,
      nativeBeforeEachCleanupAssertions: true,
      resourceLifetime: 'file',
      onUnhandledRejection(reason) {
        throw reason
      },
    })
  const consumeFacts = [],
    phaseFacts = [],
    scopes = [],
    nativeChecks = new Set(),
    observed = [],
    cases = [],
    caseSnapshots = []
  let sameError, foreign
  try {
    await file.collect(async () => {
      file.api.test(
        'native then same exact error from unknown callback',
        ({ task, expect }) => {
          phaseFacts.push(
            require(
              path.join(path.dirname(process.argv[2]), 'async-context')
            ).getOriginatingCasePhase()
          )
          task.onFinished = [
            function unknownSameError() {
              assert(sameError)
              throw sameError
            },
          ]
          expect(Promise.resolve(17)).resolves.toBe(17)
          nativeChecks.add(task.onFinished[1])
        }
      )
      file.api.test(
        'foreign origin detaches its actual native callback',
        ({ task, expect }) => {
          expect(Promise.resolve(19)).resolves.toBe(19)
          foreign = task.onFinished[0]
          task.onFinished = []
        }
      )
      file.api.test('foreign callback retains original owner', ({ task }) => {
        task.onFinished = [foreign]
      })
    })
    const runtime = runner.getAssertionRuntime(),
      originalBegin = runtime.beginAttempt
    runtime.beginAttempt = function (...args) {
      const scope = originalBegin(...args)
      const consume = scope.consumeBodyFailure
      scope.consumeBodyFailure = function (error) {
        const value = consume(error)
        consumeFacts.push({ value, message: error?.message })
        return value
      }
      const getter = Object.getOwnPropertyDescriptor(
        scope,
        'invokeFinishedCallback'
      ).get
      let wrapped
      scopes.push({ scope, context: args[0] })
      Object.defineProperty(scope, 'invokeFinishedCallback', {
        configurable: true,
        enumerable: true,
        get() {
          const invoke = getter.call(scope)
          if (!invoke) return undefined
          return (wrapped ??= async function observedInvocation(fn, payload) {
            try {
              return await invoke(fn, payload)
            } catch (error) {
              observed.push({ fn, error })
              if (nativeChecks.has(fn)) sameError = error
              throw error
            }
          })
        },
      })
      return scope
    }
    const controller = new AbortController(),
      result = await file.run({
        runId: 'actual-public-finished-guards',
        signal: controller.signal,
        captureCompletedModuleResult: true,
        onCaseEnd(value) {
          cases.push(value)
          caseSnapshots.push({
            attempt: value.attempt.id,
            markers: value.errors.map((error) => error.snapshotBodyAssertion),
            hasMarkers: value.errors.map((error) =>
              Object.hasOwn(error, 'snapshotBodyAssertion')
            ),
          })
        },
      })
    assert.deepEqual(
      result.cases.map((value) => value.status),
      ['failed', 'passed', 'failed']
    )
    assert.equal(scopes.length, 3)
    await fs.writeFile(
      path.join(dir, 'body-guards-observation.json'),
      JSON.stringify(
        {
          consumeFacts,
          phaseFacts,
          caseSnapshots,
          cases: cases.map((c) => ({
            name: c.name,
            status: c.status,
            errors: c.errors.map((e) => ({
              phase: e.phase,
              message: e.error?.message,
              marker: e.snapshotBodyAssertion,
              keys: Reflect.ownKeys(e),
            })),
          })),
          observed: observed.map((o) => ({
            known: nativeChecks.has(o.fn),
            foreign: o.fn === foreign,
            message: o.error.message,
          })),
        },
        null,
        2
      ) + '\n'
    )
    const first = cases[0]
    assert.equal(first.errors.length, 2)
    assert.equal(first.errors[0].phase, 'assertion')
    assert.equal(first.errors[1].phase, 'cleanup')
    assert.equal(cases[2].errors[0].phase, 'cleanup')
    assert.equal(first.errors[0].error, first.errors[1].error)
    assert.equal(first.errors[0].error, sameError)
    assert.equal(caseSnapshots[0].markers[0], first.attempt.id)
    assert.equal(caseSnapshots[0].hasMarkers[1], false)
    assert.equal(Object.hasOwn(first.errors[0], 'snapshotBodyAssertion'), false)
    assert.equal(cases[1].errors.length, 0)
    assert.equal(cases[2].errors.length, 1)
    assert.equal(caseSnapshots[2].hasMarkers[0], false)
    assert.deepEqual(
      consumeFacts.map((fact) => fact.value),
      [true, false, false]
    )
    assert.equal(observed.length, 3)
    assert.equal(observed[0].fn, [...nativeChecks][0])
    assert.equal(observed[0].error, observed[1].error)
    assert.equal(observed[2].fn, foreign)
    await file.dispose()
    process.stdout.write(
      JSON.stringify({
        actualScopes: scopes.length,
        actualLogicalCases: cases.length,
        nativeErrorTagged: true,
        sameExactErrorFromManualCallbackUntagged: true,
        foreignNativeCallbackUntagged: true,
        armingBeforeNativeRegistration: true,
        callbacksObservedWithoutChangingInvocationOrErrorIdentity: true,
        disposed: true,
      }) + '\n'
    )
  } finally {
    try {
      await file.dispose()
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
