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
const [consumerArg, outputArg, profile, phase] = process.argv.slice(2)
const consumer = resolve(consumerArg),
  output = resolve(outputArg)
const [provider, mode] = profile.split(':')
assert(['v8', 'istanbul'].includes(provider))
if (phase !== 'child') {
  const { runOwnedNode, assertOwnedNodeCompleted } = await import(
    '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
  )
  mkdirSync(output, { recursive: true })
  const env = { ...process.env, CI: '1', NODE_ENV: 'development' }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const owner = await runOwnedNode(
    [fileURLToPath(import.meta.url), consumer, output, profile, 'child'],
    { cwd: consumer, env, auditDir: join(output, 'owners'), timeoutMs: 30000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'actual public empty snapshot ' + profile)
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const load = createRequire(join(consumer, 'package.json'))
  const { initializeTestFile } = load('next/dist/experimental/testing/runner')
  const { SnapshotClient } = load('next/dist/experimental/testing/primitives')
  const fixture = mkdtempSync(join(consumer, '.next-readonly-empty-')),
    filePath = join(fixture, 'suite.test.mjs')
  const none = mode === 'none'
  const saved =
    '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\nexports[`removed owned body 1`] = `true`;\n'
  writeFileSync(filePath, '// actual literal empty public module\n')
  if (!none) {
    mkdirSync(join(fixture, '__snapshots__'))
    writeFileSync(join(fixture, '__snapshots__/suite.test.mjs.snap'), saved)
  }
  const pending = mode.startsWith('pending-')
  const deferred = () => {
    let resolve
    const promise = new Promise((r) => {
      resolve = r
    })
    return { promise, resolve }
  }
  const entered = deferred(),
    release = deferred(),
    controller = new AbortController()
  const publicRole = ![
    'omitted-public',
    'nontrue-public',
    'false-public',
  ].includes(mode)
  const runtimeRole = mode !== 'omitted-runtime'
  const eligible =
    publicRole &&
    runtimeRole &&
    ![
      'pass-false',
      'nested-skip',
      'case-skip',
      'beforeAll',
      'aroundAll',
      'abort-before-run',
    ].includes(mode)
  const original = Object.getOwnPropertyDescriptor(
    SnapshotClient.prototype,
    'finish'
  )
  let calls = 0,
    roots = 0,
    atRoot,
    rawRootErrors,
    taskErrors,
    rootStatus,
    rootTaskCount,
    caseResults = 0,
    bodies = 0,
    hooks = 0,
    rawFields
  Object.defineProperty(SnapshotClient.prototype, 'finish', {
    ...original,
    value: function (...args) {
      calls++
      // eslint-disable-next-line no-throw-literal -- actual undefined SDK rejection
      if (mode === 'finish-undefined') throw undefined
      const actual = Reflect.apply(original.value, this, args)
      if (pending)
        return actual.then((value) => {
          entered.resolve()
          return release.promise.then(() => {
            // eslint-disable-next-line no-throw-literal -- actual pending SDK rejection
            if (mode === 'pending-undefined') throw undefined
            return value
          })
        })
      return actual
    },
  })
  const file = initializeTestFile({
    fileId: 'empty-' + profile,
    filePath,
    publicTaskSelection: true,
    snapshotBodyFailures: true,
    snapshotUpdateMode: 'none',
    ...(publicRole
      ? { prepareEmptyPublicFile: true }
      : mode === 'nontrue-public'
        ? { prepareEmptyPublicFile: 1 }
        : mode === 'false-public'
          ? { prepareEmptyPublicFile: false }
          : {}),
    ...(provider === 'v8' && runtimeRole
      ? { finishReadOnlySnapshots: true }
      : {}),
  })
  try {
    await file.collect(() => {
      if (mode === 'nested-skip')
        file.api.describe.skip('unstarted child', () => {})
      if (mode === 'case-skip')
        file.api.test.skip('unstarted case', () => {
          bodies++
        })
      if (mode === 'beforeAll')
        file.api.beforeAll(() => {
          hooks++
        })
      if (mode === 'aroundAll')
        file.api.aroundAll(async (run) => {
          hooks++
          await run()
        })
    })
    // Collection listing is runnable-only; the real result below retains the skipped descendant.
    assert.equal(file.getCollectedCases().length, 0)
    if (mode === 'abort-before-run')
      controller.abort(new Error('actual empty pre-run abort'))
    const running = file.run({
      signal: controller.signal,
      passWithNoTests: mode !== 'pass-false',
      captureCompletedModuleResult: true,
      ...(provider === 'istanbul' && runtimeRole
        ? { captureCoverageCompletion: true }
        : {}),
      onCaseResult() {
        caseResults++
      },
      onSuiteEnd(suite, task) {
        if (suite.suiteId === 'empty-' + profile) {
          roots++
          atRoot = calls
          rawRootErrors = suite.errors
          taskErrors = task.result?.errors
          rootStatus = suite.status
          rootTaskCount = task.tasks.length
          assert.equal(
            file.getCompletedReadOnlySnapshotCoverageFailure?.(),
            undefined
          )
          assert.equal(file.getCompletedCoverageFailures(), undefined)
          if (
            suite.errors[0] &&
            eligible &&
            mode !== 'finish-undefined' &&
            mode !== 'pending-undefined'
          )
            rawFields = Object.getOwnPropertyDescriptors(suite.errors[0].error)
        }
      },
    })
    if (pending) {
      await entered.promise
      assert.equal(calls, 1)
      assert.equal(roots, 0)
      assert.equal(file.getSnapshotSummary(), undefined)
      assert.equal(
        file.getCompletedReadOnlySnapshotCoverageFailure?.(),
        undefined
      )
      await assert.rejects(
        file.dispose(),
        /Abort and await the active test file/
      )
      if (mode === 'pending-abort')
        controller.abort(new Error('actual empty finish abort'))
      release.resolve()
    }
    const result = await running
    assert.equal(roots, 1)
    assert.equal(atRoot, eligible ? 1 : 0)
    assert.equal(result.cases.length, mode === 'case-skip' ? 1 : 0)
    assert.equal(caseResults, mode === 'case-skip' ? 1 : 0)
    assert.equal(bodies, 0)
    assert.equal(
      rootTaskCount,
      ['case-skip', 'nested-skip'].includes(mode) ? 1 : 0
    )
    assert.equal(
      file.getCompletedReadOnlySnapshotCoverageFailure?.(),
      undefined
    )
    if (eligible) {
      const obsolete =
        !none && !['finish-undefined', 'pending-undefined'].includes(mode)
      assert.equal(result.errors.length, obsolete ? 1 : 0)
      if (obsolete) {
        assert.equal(rawRootErrors[0], result.errors[0])
        assert.equal(result.errors[0].phase, 'runtime')
        assert.equal(
          result.errors[0].error.message,
          'Obsolete snapshots found when no snapshot update is expected.\n· removed owned body 1\n'
        )
        assert.equal(taskErrors.length, 1)
        assert.equal(taskErrors[0].message, result.errors[0].error.message)
      }
    }
    let rejected = false,
      disposal
    try {
      await file.dispose(
        ['cleanup-same-error', 'cleanup-undefined'].includes(mode)
          ? {
              beforeOwnedWorkerDispose() {
                // eslint-disable-next-line no-throw-literal -- independent undefined cleanup remains physical
                if (mode === 'cleanup-undefined') throw undefined
                throw result.errors[0].error
              },
            }
          : undefined
      )
    } catch (error) {
      rejected = true
      disposal = error
    }
    assert.equal(calls, 1)
    const observed =
      provider === 'v8'
        ? file.getCompletedReadOnlySnapshotCoverageFailure?.()
        : file.getCompletedCoverageFailures()
    const unsafe = [
      'finish-undefined',
      'pending-undefined',
      'pending-abort',
      'cleanup-same-error',
      'cleanup-undefined',
      'abort-before-run',
    ].includes(mode)
    if (eligible && !unsafe) {
      assert.equal(rejected, false)
      if (none)
        assert.equal(
          provider === 'v8' ? observed : observed.length,
          provider === 'v8' ? undefined : 0
        )
      else
        assert.equal(
          provider === 'v8' ? observed : observed[0],
          result.errors[0]
        )
    } else assert.equal(observed, undefined)
    if (['finish-undefined', 'pending-undefined'].includes(mode)) {
      assert(rejected)
      assert(disposal instanceof globalThis.AggregateError)
      assert(disposal.errors.includes(undefined))
    }
    if (mode === 'cleanup-undefined') {
      assert(rejected)
      assert.equal(disposal, undefined)
    }
    if (mode === 'cleanup-same-error') {
      assert(rejected)
      assert.equal(disposal, result.errors[0].error)
    }
    if (rawFields)
      assert.deepEqual(
        Object.getOwnPropertyDescriptors(result.errors[0].error),
        rawFields
      )
    assert.equal(file.canPublishSnapshots(), false)
    const operations = file.getOperationSettlement()
    if (operations) {
      assert.equal(operations.bounded.pending, 0)
      assert.equal(operations.around.pending, 0)
      assert.equal(operations.pendingHooks, 0)
    }
    assert.equal(
      existsSync(join(fixture, '__snapshots__/suite.test.mjs.snap')),
      !none
    )
    if (!none)
      assert.equal(
        readFileSync(
          join(fixture, '__snapshots__/suite.test.mjs.snap'),
          'utf8'
        ),
        saved
      )
    writeFileSync(
      join(output, 'VERIFIED.json'),
      JSON.stringify(
        {
          provider,
          mode,
          actualPublicEmptyFile: publicRole,
          actualRootEvents: roots,
          actualCaseResults: caseResults,
          actualBodies: bodies,
          actualHooks: hooks,
          actualSDKFinishOnce: calls === 1,
          atRoot,
          rootStatus,
          rootTaskCount,
          physicalDisposeRejected: rejected,
          freshCarrierOnly: true,
          allPhysicalVetoesRetained: true,
          snapshotBytesUnchanged: true,
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
    Object.defineProperty(SnapshotClient.prototype, 'finish', original)
    rmSync(fixture, { recursive: true, force: true })
  }
}
