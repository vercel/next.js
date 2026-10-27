import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
function deferred() {
  let resolve, reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
const [consumerArg, outputArg, mode, phase] = process.argv.slice(2)
const consumer = resolve(consumerArg),
  output = resolve(outputArg)
if (phase !== 'child') {
  const { runOwnedNode, assertOwnedNodeCompleted } = await import(
    '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
  )
  mkdirSync(output, { recursive: true })
  const env = { ...process.env, CI: '1', NODE_ENV: 'development' }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const owner = await runOwnedNode(
    [fileURLToPath(import.meta.url), consumer, output, mode, 'child'],
    { cwd: consumer, env, auditDir: join(output, 'owners'), timeoutMs: 30000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'actual readonly snapshot finish ' + mode)
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const load = createRequire(join(consumer, 'package.json'))
  const runner = load('next/dist/experimental/testing/runner')
  const { SnapshotClient } = load('next/dist/compiled/next-test-primitives')
  if (mode === 'deferred-fence') {
    mkdirSync(output, { recursive: true })
    const fixture = mkdtempSync(
      join(consumer, '.next-readonly-snapshot-deferred-')
    )
    const original = Object.getOwnPropertyDescriptor(
      SnapshotClient.prototype,
      'finish'
    )
    let calls = 0
    Object.defineProperty(SnapshotClient.prototype, 'finish', {
      ...original,
      value: function (...args) {
        calls++
        return Reflect.apply(original.value, this, args)
      },
    })
    const { createAssertionRuntime } = load(
      'next/dist/experimental/testing/assertions'
    )
    let runtime
    try {
      runtime = await createAssertionRuntime({
        testPath: join(fixture, 'suite.test.mjs'),
        snapshotUpdateMode: 'none',
        deferSnapshotPreparation: true,
        captureCoverageCompletion: () => true,
        getCurrentAttempt: () => undefined,
      })
      assert.equal(
        await runtime.finishReadOnlySnapshotSelection([], {
          partial: false,
          complete: false,
        }),
        undefined
      )
      assert.equal(calls, 0)
      await runtime.finishFile()
      writeFileSync(
        join(output, 'VERIFIED.json'),
        JSON.stringify({
          mode,
          syntheticDeferredExcluded: true,
          newMethodFinishCalls: 0,
          originalFinishCleanupInvoked: true,
        }) + '\n'
      )
    } finally {
      await runtime?.finishFile()
      Object.defineProperty(SnapshotClient.prototype, 'finish', original)
      rmSync(fixture, { recursive: true, force: true })
    }
  } else {
    const fixture = mkdtempSync(
      join(consumer, '.next-readonly-snapshot-finish-')
    )
    const filePath = join(fixture, 'suite.test.mjs')
    const saved =
      '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\nexports[`first owned body 1`] = `SPECIAL(1)`;\n' +
      (mode === 'skipped-selection'
        ? 'exports[`selected skipped body 1`] = `true`;\n'
        : '')
    const success = mode.startsWith('successful-'),
      requested = mode !== 'omitted' && mode !== 'successful-omitted'
    writeFileSync(filePath, '// actual file readonly snapshot ownership\n')
    if (!success) {
      mkdirSync(join(fixture, '__snapshots__'))
      writeFileSync(join(fixture, '__snapshots__/suite.test.mjs.snap'), saved)
    }
    mkdirSync(output, { recursive: true })
    const raw = new Error('actual beforeEach raw failure'),
      fields = Object.getOwnPropertyDescriptors(raw),
      cleanupFailure = new Error('actual separate cleanup failure')
    const entered = deferred()
    const release = deferred()
    const controller = new AbortController()
    const pending = mode.startsWith('pending-')
    const originalFinish = Object.getOwnPropertyDescriptor(
      SnapshotClient.prototype,
      'finish'
    )
    const originalSkip = Object.getOwnPropertyDescriptor(
      SnapshotClient.prototype,
      'skipTest'
    )
    let skipCalls = 0
    Object.defineProperty(SnapshotClient.prototype, 'skipTest', {
      ...originalSkip,
      value: function (...args) {
        skipCalls++
        return Reflect.apply(originalSkip.value, this, args)
      },
    })
    let calls = 0,
      bodies = 0,
      hooks = 0,
      atRoot,
      taskErrors,
      rootErrors,
      rootEvents = 0,
      disposeFailure,
      disposedRejected = false
    Object.defineProperty(SnapshotClient.prototype, 'finish', {
      ...originalFinish,
      value: function (...args) {
        calls++
        // eslint-disable-next-line no-throw-literal -- actual undefined snapshot finish rejection
        if (mode === 'finish-undefined') throw undefined
        if (mode === 'finish-same-error') throw raw
        if (pending) {
          if (mode === 'pending-undefined') {
            entered.resolve()
            return release.promise.then(() => {
              // eslint-disable-next-line no-throw-literal -- actual pending undefined finish rejection
              throw undefined
            })
          }
          return Reflect.apply(originalFinish.value, this, args).then(
            (result) => {
              entered.resolve()
              return release.promise.then(() => result)
            }
          )
        }
        return Reflect.apply(originalFinish.value, this, args)
      },
    })
    const file = runner.initializeTestFile({
      fileId: 'readonly-' + mode,
      filePath,
      publicTaskSelection: true,
      snapshotBodyFailures: true,
      snapshotUpdateMode: 'none',
    })
    const OriginalSet = globalThis.Set
    let setConstructors = 0
    try {
      await file.collect(() => {
        if (!success && mode !== 'body')
          file.api.beforeEach(
            mode === 'async'
              ? async () => {
                  hooks++
                  await Promise.resolve()
                  throw raw
                }
              : () => {
                  hooks++
                  throw raw
                }
          )
        if (mode === 'mixed-afterEach')
          file.api.afterEach(() => {
            throw raw
          })
        if (mode === 'afterAll')
          file.api.afterAll(() => {
            throw raw
          })
        const body = () => {
          bodies++
          if (mode === 'body') throw raw
        }
        for (const name of ['first owned body', 'second owned body'])
          file.api.test(name, body)
        if (mode === 'skipped-selection')
          file.api.test.skip('selected skipped body', body)
      })
      if (success)
        globalThis.Set = new Proxy(OriginalSet, {
          construct(target, args, receiver) {
            setConstructors++
            return Reflect.construct(target, args, receiver)
          },
        })
      if (mode === 'finalization-same-error') {
        const runtime = runner.getAssertionRuntime()
        const original = runtime.beginFileFixtures
        runtime.beginFileFixtures = function (context) {
          const scope = Reflect.apply(original, this, [context])
          const finalize = scope.finalize
          scope.finalize = async () => {
            await Reflect.apply(finalize, scope, [])
            throw raw
          }
          return scope
        }
      }
      const running = file.run({
        signal: controller.signal,
        captureCompletedModuleResult: true,
        ...(requested ? { captureCoverageCompletion: true } : {}),
        onSuiteEnd(suite, task) {
          if (suite.suiteId === 'readonly-' + mode) {
            rootEvents++
            atRoot = calls
            rootErrors = suite.errors
            taskErrors = task.result?.errors
          }
        },
      })
      if (pending) {
        await entered.promise
        assert.equal(calls, 1)
        assert.equal(rootEvents, 0)
        assert.equal(file.getSnapshotSummary(), undefined)
        assert.equal(file.getCompletedCoverageFailures(), undefined)
        await assert.rejects(
          file.dispose(),
          /Abort and await the active test file/
        )
        if (mode === 'pending-abort')
          controller.abort(new Error('actual abort during snapshot finish'))
        release.resolve()
      }
      const result = await running
      assert.equal(rootEvents, 1)
      const logical =
        requested &&
        !success &&
        ![
          'body',
          'mixed-afterEach',
          'afterAll',
          'finish-undefined',
          'finish-same-error',
          'pending-undefined',
          'finalization-same-error',
        ].includes(mode)
      assert.equal(
        atRoot,
        logical || mode.startsWith('finish-') || mode === 'pending-undefined'
          ? 1
          : 0
      )
      assert.equal(result.cases.length, mode === 'skipped-selection' ? 3 : 2)
      assert.equal(
        result.cases.filter((x) => x.status === 'failed').length,
        success ? 0 : 2
      )
      assert.equal(bodies, success || mode === 'body' ? 2 : 0)
      assert.equal(hooks, success || mode === 'body' ? 0 : 2)
      if (logical) {
        assert.equal(result.errors.length, 1)
        assert.equal(result.errors[0], rootErrors[0])
        assert.equal(result.errors[0].phase, 'runtime')
        assert.equal(
          result.errors[0].error.message,
          'Obsolete snapshots found when no snapshot update is expected.\n· first owned body 1\n'
        )
        assert.equal(taskErrors.length, 1)
        assert.equal(taskErrors[0].message, result.errors[0].error.message)
        assert.equal(file.getCompletedModuleResult().finalState, 'fail')
      } else
        assert.equal(
          result.errors.length,
          mode === 'afterAll' || mode === 'finalization-same-error' ? 1 : 0
        )
      try {
        await file.dispose(
          mode === 'cleanup-error'
            ? {
                beforeOwnedWorkerDispose() {
                  throw cleanupFailure
                },
              }
            : mode === 'cleanup-same-obsolete'
              ? {
                  beforeOwnedWorkerDispose() {
                    throw result.errors[0].error
                  },
                }
              : undefined
        )
      } catch (error) {
        disposedRejected = true
        disposeFailure = error
      }
      if (success) globalThis.Set = OriginalSet
      assert.equal(calls, 1, 'actual SnapshotClient.finish must run once')
      assert.equal(
        skipCalls,
        mode === 'skipped-selection' ? 1 : 0,
        'skip selection must run once before actual SDK finish deletes state'
      )
      const completion = file.getCompletedCoverageFailures()
      if (
        [
          'finish-undefined',
          'finish-same-error',
          'pending-undefined',
          'body',
        ].includes(mode)
      ) {
        assert(disposedRejected)
        assert(disposeFailure instanceof globalThis.AggregateError)
        if (mode === 'body')
          assert(
            disposeFailure.errors.some(
              (error) =>
                error.message ===
                'Obsolete snapshots found (1); run with --update to remove them.'
            )
          )
        else
          assert(
            disposeFailure.errors.includes(
              mode === 'finish-undefined' || mode === 'pending-undefined'
                ? undefined
                : raw
            )
          )
        assert.equal(completion, undefined)
      } else if (mode === 'cleanup-error' || mode === 'cleanup-same-obsolete') {
        assert(disposedRejected)
        assert.equal(
          disposeFailure,
          mode === 'cleanup-error' ? cleanupFailure : result.errors[0].error
        )
        assert.equal(completion, undefined)
      } else {
        assert.equal(disposedRejected, false)
        if (logical && mode !== 'pending-abort')
          assert.equal(completion[0], result.errors[0])
        else if (
          !requested ||
          mode === 'mixed-afterEach' ||
          mode === 'finalization-same-error' ||
          mode === 'pending-abort'
        )
          assert.equal(completion, undefined)
      }
      if (!success) {
        assert.equal(
          readFileSync(
            join(fixture, '__snapshots__/suite.test.mjs.snap'),
            'utf8'
          ),
          saved
        )
        assert.equal(file.canPublishSnapshots(), false)
      }
      assert.deepEqual(Object.getOwnPropertyDescriptors(raw), fields)
      const operations = file.getOperationSettlement()
      if (operations) {
        assert.equal(operations.bounded.pending, 0)
        assert.equal(operations.around.pending, 0)
        assert.equal(operations.pendingHooks, 0)
      }
      writeFileSync(
        join(output, 'VERIFIED.json'),
        JSON.stringify(
          {
            mode,
            actualFile: true,
            actualSnapshotFinishOnce: true,
            skipCalls,
            ...(success ? { setConstructors } : {}),
            noRepeatedSkipAfterStateDeletion: true,
            atRoot,
            bodies,
            hooks,
            actualLogicalObsolete: logical,
            rootErrorCount: rootErrors.length,
            rootEvents,
            pendingFinish: pending,
            actualAbortDuringAwait: mode === 'pending-abort',
            physicalDisposeStillRejects: disposedRejected,
            completion: completion?.length,
            snapshotBytesUnchanged: true,
            rawErrorFieldsUnchanged: true,
            operations,
          },
          null,
          2
        ) + '\n'
      )
    } finally {
      try {
        await file.dispose()
      } catch {}
      globalThis.Set = OriginalSet
      Object.defineProperty(SnapshotClient.prototype, 'finish', originalFinish)
      Object.defineProperty(SnapshotClient.prototype, 'skipTest', originalSkip)
      rmSync(fixture, { recursive: true, force: true })
    }
  }
}
