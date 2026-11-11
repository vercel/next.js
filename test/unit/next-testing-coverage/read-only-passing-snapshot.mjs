import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  assertOwnedNodeCompleted(owner, 'actual readonly passed-file finish ' + mode)
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const load = createRequire(join(consumer, 'package.json'))
  const runner = load('next/dist/experimental/testing/runner')
  const { SnapshotClient } = load('next/dist/experimental/testing/primitives')
  const fixture = mkdtempSync(join(consumer, '.next-readonly-passing-'))
  const filePath = join(fixture, 'suite.test.mjs')
  const noSnapshots = mode.startsWith('none')
  const removed = ['skip-first', 'filtered', 'focused', 'all-skipped'].includes(
    mode
  )
  const saved =
    '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\nexports[`first owned body 1`] = `SPECIAL(1)`;\n' +
    (removed ? '\nexports[`removed owned body 1`] = `true`;\n' : '')
  writeFileSync(filePath, '// actual passed File readonly snapshot ownership\n')
  if (!noSnapshots) {
    mkdirSync(join(fixture, '__snapshots__'))
    writeFileSync(join(fixture, '__snapshots__/suite.test.mjs.snap'), saved)
  }
  const raw = new Error('actual independent stage failure')
  const fields = Object.getOwnPropertyDescriptors(raw)
  const controller = new AbortController()
  const deferred = () => {
    let resolve
    const promise = new Promise((r) => {
      resolve = r
    })
    return { promise, resolve }
  }
  const entered = deferred(),
    release = deferred()
  const pending = mode.startsWith('pending-')
  const originalFinish = Object.getOwnPropertyDescriptor(
    SnapshotClient.prototype,
    'finish'
  )
  const OriginalSet = globalThis.Set
  let calls = 0,
    bodies = 0,
    rootEvents = 0,
    atRoot,
    rootErrors,
    taskErrors,
    rootStatus,
    setConstructors = 0
  Object.defineProperty(SnapshotClient.prototype, 'finish', {
    ...originalFinish,
    value: function (...args) {
      calls++
      // eslint-disable-next-line no-throw-literal -- actual undefined SnapshotClient.finish rejection
      if (mode === 'finish-undefined') throw undefined
      const actual = Reflect.apply(originalFinish.value, this, args)
      if (pending)
        return actual.then((result) => {
          entered.resolve()
          return release.promise.then(() => result)
        })
      return actual
    },
  })
  const file = runner.initializeTestFile({
    fileId: 'readonly-passing-' + mode,
    filePath,
    publicTaskSelection: true,
    snapshotBodyFailures: true,
    snapshotUpdateMode: 'none',
  })
  const requested = mode !== 'omitted' && mode !== 'none-omitted'
  const early = [
    'obsolete',
    'none',
    'skip-first',
    'filtered',
    'focused',
    'cleanup-same-obsolete',
    'finish-undefined',
    'pending-finish',
    'pending-abort',
  ].includes(mode)
  const obsolete = early && mode !== 'none' && mode !== 'finish-undefined'
  const keys = removed ? ['removed owned body 1'] : ['first owned body 1']
  try {
    await file.collect(() => {
      if (mode === 'beforeAll')
        file.api.beforeAll(() => {
          throw raw
        })
      if (mode === 'afterEach')
        file.api.afterEach(() => {
          throw raw
        })
      if (mode !== 'empty') {
        const body = () => {
          bodies++
          if (mode === 'body') throw raw
        }
        ;(['skip-first', 'all-skipped'].includes(mode)
          ? file.api.test.skip
          : file.api.test)('first owned body', body)
        ;(mode === 'all-skipped'
          ? file.api.test.skip
          : mode === 'focused'
            ? file.api.test.only
            : file.api.test)('second owned body', body)
      }
    })
    if (noSnapshots)
      globalThis.Set = new Proxy(OriginalSet, {
        construct(target, args, receiver) {
          setConstructors++
          return Reflect.construct(target, args, receiver)
        },
      })
    if (mode === 'abort-before-run')
      controller.abort(new Error('actual pre-run abort'))
    const running = file.run({
      signal: controller.signal,
      passWithNoTests: mode === 'empty',
      allowOnly: true,
      ...(mode === 'filtered' ? { testNamePattern: 'second owned body' } : {}),
      captureCompletedModuleResult: true,
      ...(requested ? { captureCoverageCompletion: true } : {}),
      onSuiteEnd(suite, task) {
        if (suite.suiteId === 'readonly-passing-' + mode) {
          rootEvents++
          atRoot = calls
          rootErrors = suite.errors
          taskErrors = task.result?.errors
          rootStatus = suite.status
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
    assert.equal(atRoot, early ? 1 : 0)
    if (early) {
      assert.equal(result.cases.length, 2)
      assert.equal(result.cases.filter((c) => c.status === 'failed').length, 0)
      assert.equal(
        bodies,
        ['skip-first', 'filtered', 'focused'].includes(mode) ? 1 : 2
      )
      assert.equal(result.errors.length, obsolete ? 1 : 0)
      if (obsolete) {
        assert.equal(rootStatus, 'failed')
        assert.equal(rootErrors[0], result.errors[0])
        assert.equal(result.errors[0].phase, 'runtime')
        assert.equal(
          result.errors[0].error.message,
          'Obsolete snapshots found when no snapshot update is expected.\n' +
            keys.map((key) => '· ' + key + '\n').join('')
        )
        assert.equal(taskErrors.length, 1)
        assert.equal(taskErrors[0].message, result.errors[0].error.message)
      } else {
        assert.equal(rootStatus, 'passed')
        assert.equal(taskErrors?.length ?? 0, 0)
      }
    }
    let disposedRejected = false,
      disposeError
    try {
      await file.dispose(
        mode === 'cleanup-same-obsolete'
          ? {
              beforeOwnedWorkerDispose() {
                throw result.errors[0].error
              },
            }
          : undefined
      )
    } catch (error) {
      disposedRejected = true
      disposeError = error
    }
    if (noSnapshots) globalThis.Set = OriginalSet
    assert.equal(calls, 1)
    const completion = file.getCompletedCoverageFailures()
    if (mode === 'finish-undefined') {
      assert(disposedRejected)
      assert(disposeError instanceof globalThis.AggregateError)
      assert(disposeError.errors.includes(undefined))
      assert.equal(completion, undefined)
    } else if (mode === 'cleanup-same-obsolete') {
      assert(disposedRejected)
      assert.equal(disposeError, result.errors[0].error)
      assert.equal(completion, undefined)
    } else if (early && mode !== 'pending-abort') {
      assert.equal(disposedRejected, false)
      assert.equal(completion.length, obsolete ? 1 : 0)
      completion.forEach((failure, index) =>
        assert.equal(failure, result.errors[index])
      )
    } else if (
      !requested ||
      ['body', 'afterEach', 'pending-abort', 'abort-before-run'].includes(mode)
    )
      assert.equal(completion, undefined)
    else assert.equal(atRoot, 0)
    assert.equal(file.canPublishSnapshots(), false)
    if (!noSnapshots)
      assert.equal(
        readFileSync(
          join(fixture, '__snapshots__/suite.test.mjs.snap'),
          'utf8'
        ),
        saved
      )
    else
      assert.equal(
        existsSync(join(fixture, '__snapshots__/suite.test.mjs.snap')),
        false
      )
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
          rootEvents,
          atRoot,
          rootStatus,
          bodies,
          actualRootErrors: rootErrors.map((f) => ({
            phase: f.phase,
            message: f.error?.message,
          })),
          actualTaskErrors: taskErrors?.map((e) => ({
            name: e.name,
            message: e.message,
          })),
          actualLogicalObsolete: obsolete,
          physicalDisposeStillRejects: disposedRejected,
          completion: completion?.length,
          snapshotBytesUnchanged: true,
          rawErrorFieldsUnchanged: true,
          ...(noSnapshots ? { setConstructors } : {}),
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
    rmSync(fixture, { recursive: true, force: true })
  }
}
