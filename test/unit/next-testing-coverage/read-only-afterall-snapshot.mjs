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
  assertOwnedNodeCompleted(owner, 'actual readonly afterAll ' + mode)
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const load = createRequire(join(consumer, 'package.json'))
  const runner = load('next/dist/experimental/testing/runner')
  const { SnapshotClient } = load('next/dist/experimental/testing/primitives')
  const fixture = mkdtempSync(join(consumer, '.next-readonly-afterall-'))
  const filePath = join(fixture, 'suite.test.mjs')
  const saved =
    '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\nexports[`first owned body 1`] = `SPECIAL(1)`;\n'
  writeFileSync(
    filePath,
    '// actual File afterAll readonly snapshot ownership\n'
  )
  mkdirSync(join(fixture, '__snapshots__'))
  writeFileSync(join(fixture, '__snapshots__/suite.test.mjs.snap'), saved)
  const raw = new Error('actual afterAll failure')
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
  const originalFinish = Object.getOwnPropertyDescriptor(
    SnapshotClient.prototype,
    'finish'
  )
  let calls = 0,
    bodies = 0,
    hooks = 0,
    rootEvents = 0,
    atRoot,
    taskErrors,
    rootErrors
  const pending = mode === 'pending-abort'
  Object.defineProperty(SnapshotClient.prototype, 'finish', {
    ...originalFinish,
    value: function (...args) {
      calls++
      // eslint-disable-next-line no-throw-literal -- actual undefined snapshot finish rejection
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
    fileId: 'readonly-afterall-' + mode,
    filePath,
    publicTaskSelection: true,
    snapshotBodyFailures: true,
    snapshotUpdateMode: 'none',
  })
  const requested = mode !== 'omitted'
  const admitted = [
    'sync',
    'async',
    'skip-first',
    'skip-second',
    'cleanup-same-error',
    'finish-undefined',
    'pending-abort',
  ].includes(mode)
  const obsolete =
    admitted && mode !== 'skip-first' && mode !== 'finish-undefined'
  try {
    await file.collect(() => {
      if (mode === 'beforeAll')
        file.api.beforeAll(() => {
          throw raw
        })
      if (mode === 'afterEach-same-error')
        file.api.afterEach(() => {
          throw raw
        })
      if (mode !== 'beforeAll')
        file.api.afterAll(
          mode === 'async'
            ? async () => {
                hooks++
                await Promise.resolve()
                throw raw
              }
            : mode === 'timeout'
              ? () => {
                  hooks++
                  return new Promise(() => {})
                }
              : () => {
                  hooks++
                  throw raw
                }
        )
      if (mode !== 'empty') {
        const body = () => {
          bodies++
          if (mode === 'body-same-error') throw raw
        }
        ;(mode === 'skip-first' ? file.api.test.skip : file.api.test)(
          'first owned body',
          body
        )
        ;(mode === 'skip-second' ? file.api.test.skip : file.api.test)(
          'second owned body',
          body
        )
      }
    })
    if (mode === 'abort-before-run')
      controller.abort(new Error('actual pre-run abort'))
    const running = file.run({
      signal: controller.signal,
      hookTimeout: mode === 'timeout' ? 10 : 1000,
      passWithNoTests: mode === 'empty',
      captureCompletedModuleResult: true,
      ...(requested ? { captureCoverageCompletion: true } : {}),
      onSuiteEnd(suite, task) {
        if (suite.suiteId === 'readonly-afterall-' + mode) {
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
      assert.equal(file.getCompletedCoverageFailures(), undefined)
      await assert.rejects(
        file.dispose(),
        /Abort and await the active test file/
      )
      controller.abort(
        new Error('actual abort during afterAll snapshot finish')
      )
      release.resolve()
    }
    const result = await running
    assert.equal(rootEvents, 1)
    assert.equal(atRoot, admitted ? 1 : 0)
    if (admitted) {
      assert.equal(result.cases.length, 2)
      assert.equal(result.cases.filter((c) => c.status === 'failed').length, 0)
      assert.equal(bodies, mode.startsWith('skip-') ? 1 : 2)
      assert.equal(hooks, 1)
      assert.equal(result.errors.length, obsolete ? 2 : 1)
      assert.equal(rootErrors[0], result.errors[0])
      assert.equal(result.errors[0].error, raw)
      assert.equal(result.errors[0].phase, 'afterAll')
      assert.equal(taskErrors[0].message, raw.message)
      if (obsolete) {
        assert.equal(rootErrors[1], result.errors[1])
        assert.equal(result.errors[1].phase, 'runtime')
        assert.equal(
          result.errors[1].error.message,
          'Obsolete snapshots found when no snapshot update is expected.\n· first owned body 1\n'
        )
        assert.equal(taskErrors.length, 2)
        assert.equal(taskErrors[1].message, result.errors[1].error.message)
      }
    }
    let disposedRejected = false,
      disposeError
    try {
      await file.dispose(
        mode === 'cleanup-same-error'
          ? {
              beforeOwnedWorkerDispose() {
                throw raw
              },
            }
          : undefined
      )
    } catch (error) {
      disposedRejected = true
      disposeError = error
    }
    assert.equal(calls, 1)
    const completion = file.getCompletedCoverageFailures()
    if (mode === 'finish-undefined') {
      assert(disposedRejected)
      assert(disposeError instanceof globalThis.AggregateError)
      assert(disposeError.errors.includes(undefined))
    } else if (mode === 'cleanup-same-error') {
      assert(disposedRejected)
      assert.equal(disposeError, raw)
    }
    if (['sync', 'async', 'skip-first', 'skip-second'].includes(mode)) {
      assert.equal(disposedRejected, false)
      assert.equal(completion.length, obsolete ? 2 : 1)
      completion.forEach((failure, index) =>
        assert.equal(failure, result.errors[index])
      )
    } else if (
      mode === 'beforeAll' ||
      mode === 'empty' ||
      mode === 'body-same-error'
    ) {
      // These already-supported captures remain separate from early snapshot finish.
      assert.equal(atRoot, 0)
    } else assert.equal(completion, undefined)
    assert.equal(file.canPublishSnapshots(), false)
    assert.equal(
      readFileSync(join(fixture, '__snapshots__/suite.test.mjs.snap'), 'utf8'),
      saved
    )
    assert.deepEqual(Object.getOwnPropertyDescriptors(raw), fields)
    const operations = file.getOperationSettlement()
    if (mode !== 'timeout' && operations) {
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
          bodies,
          hooks,
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
    Object.defineProperty(SnapshotClient.prototype, 'finish', originalFinish)
    rmSync(fixture, { recursive: true, force: true })
  }
}
