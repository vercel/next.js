import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, mode, phase] = process.argv.slice(2)
const consumer = resolve(consumerArg),
  output = resolve(outputArg)
mkdirSync(output, { recursive: true })
if (phase !== 'child') {
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
  assertOwnedNodeCompleted(owner, 'actual beforeAll Array carrier ' + mode)
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const load = createRequire(join(consumer, 'package.json'))
  const runner = load('next/dist/experimental/testing/runner'),
    life = load('next/dist/experimental/testing/runner/lifecycle')
  const fixture = mkdtempSync(
      join(consumer, '.next-beforeall-array-carriers-')
    ),
    filePath = join(fixture, 'contract.test.mjs')
  writeFileSync(filePath, '// actual beforeAll failure-carrier contract\n')
  const first = new Error('actual Array first'),
    second = new Error('actual Array second'),
    fields = [first, second].map((e) => Object.getOwnPropertyDescriptors(e))
  const values =
    mode === 'repeated'
      ? [first, first]
      : mode.startsWith('primitive')
        ? [1, undefined]
        : [first, second]
  const counts = {
    map: 0,
    zero: 0,
    one: 0,
    iterator: 0,
    hooks: 0,
    bodies: 0,
    starts: 0,
  }
  let creator, borrowed, discarded, firstMapped
  if (['borrowed', 'mixed-borrowed'].includes(mode)) {
    writeFileSync(
      join(fixture, 'creator.test.mjs'),
      '// actual creator callback scope\n'
    )
    creator = runner.initializeTestFile({
      fileId: 'actual-creator',
      filePath: join(fixture, 'creator.test.mjs'),
      publicTaskSelection: true,
      snapshotUpdateMode: 'none',
    })
    await creator.collect(() => {
      creator.api.beforeAll(() => {
        throw first
      })
      creator.api.test('creator never body', () => {
        throw new Error('must not run')
      })
    })
    await creator.run({
      signal: new AbortController().signal,
      captureCompletedModuleResult: true,
      captureCoverageCompletion: true,
    })
    await creator.dispose()
    borrowed = creator.getCompletedCoverageFailures()[0]
    assert(life.isSettledCoverageFailure(borrowed))
  }
  const errors = []
  Object.defineProperty(errors, '0', {
    configurable: true,
    enumerable: true,
    get() {
      counts.zero++
      return values[0]
    },
  })
  Object.defineProperty(errors, '1', {
    configurable: true,
    enumerable: true,
    get() {
      counts.one++
      return values[1]
    },
  })
  Object.defineProperty(errors, 'map', {
    configurable: true,
    get() {
      counts.map++
      return [
        'borrowed',
        'mixed-borrowed',
        'duplicate-fresh',
        'missing-map',
      ].includes(mode)
        ? function (callback) {
            if (mode === 'borrowed') return [borrowed]
            if (mode === 'missing-map')
              return [
                { phase: 'beforeAll', error: first },
                { phase: 'beforeAll', error: second },
              ]
            const actual = Reflect.apply(Array.prototype.map, this, [callback])
            firstMapped = actual[0]
            discarded = actual[1]
            return mode === 'duplicate-fresh'
              ? [actual[0], actual[0]]
              : [actual[0], borrowed]
          }
        : Array.prototype.map
    },
  })
  Object.defineProperty(errors, Symbol.iterator, {
    configurable: true,
    get() {
      counts.iterator++
      return Array.prototype[Symbol.iterator]
    },
  })
  if (['finalizer-same', 'scope-dispose-same'].includes(mode)) {
    const { createCollector } = load(
      'next/dist/experimental/testing/runner/collector'
    )
    const collector = createCollector('actual-integration-array', { filePath })
    collector.api.beforeAll(() => {
      counts.hooks++
      throw errors
    })
    collector.api.test('unstarted', () => {
      counts.bodies++
    })
    await collector.settle()
    const operations = { bounded: new Set(), around: new Set() }
    const scope = () => ({ async finalize() {}, async dispose() {} })
    const result = await life.runCollected(
      collector.close(),
      {
        runId: 'actual-integration-array-run',
        signal: new AbortController().signal,
        captureCoverageCompletion: true,
        onCaseStart() {
          counts.starts++
        },
      },
      () => {},
      {
        beginFileFixtures: scope,
        setActiveHook() {},
        beginHook(context) {
          return {
            async finalize() {
              if (context.hook === 'beforeAll' && mode === 'finalizer-same')
                throw first
            },
            async dispose() {
              if (context.hook === 'beforeAll' && mode === 'scope-dispose-same')
                throw first
            },
          }
        },
      },
      undefined,
      operations
    )
    assert.equal(counts.bodies, 0)
    assert.equal(counts.starts, 0)
    assert.equal(counts.hooks, 1)
    assert.deepEqual(
      result.errors.map((f) => f.error),
      [first, second, first]
    )
    assert.deepEqual(result.errors.map(life.isSettledCoverageFailure), [
      true,
      true,
      false,
    ])
    assert.notEqual(result.errors[0], result.errors[2])
    assert.equal(result.interrupted, false)
    assert([...operations.bounded].every((o) => o.settled))
    assert([...operations.around].every((o) => o.settled))
    assert.equal(operations.pendingHooks.size, 0)
    assert.deepEqual(
      [counts.map, counts.zero, counts.one, counts.iterator],
      [1, 1, 1, 0]
    )
    assert.deepEqual(
      [first, second].map((e) => Object.getOwnPropertyDescriptors(e)),
      fields
    )
    writeFileSync(
      join(output, 'CHECKS.json'),
      JSON.stringify(
        {
          mode,
          actualCallbackCarrierOwnership: true,
          noBodyInvocations: true,
          noInventedStarts: true,
          actualOperationJoins: true,
          otherStageAndBorrowedVeto: true,
          originalArrayReadsPreserved: true,
          rawErrorsUnchanged: true,
          snapshotPolicyTouched: false,
        },
        null,
        2
      ) + '\n'
    )
    rmSync(fixture, { recursive: true, force: true })
  } else {
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
    const native = []
    const rejection = (reason, promise) => {
      native.push({
        reason,
        promise,
        routed: runner.routeUnhandledRejection(reason, promise),
      })
    }
    if (mode === 'late') process.on('unhandledRejection', rejection)
    const file = runner.initializeTestFile({
      fileId: 'actual-beforeall-array',
      filePath,
      publicTaskSelection: true,
      snapshotBodyFailures: true,
      onUnhandledRejection() {},
      snapshotUpdateMode: 'none',
    })
    try {
      await file.collect(() => {
        const hook = () => {
          counts.hooks++
          if (mode === 'late') void Promise.reject(first)
          throw errors
        }
        const selected =
          mode === 'fixture'
            ? file.api.test.extend({ value: 1 })
            : file.api.test
        const hookApi = mode === 'fixture' ? selected : file.api
        hookApi.beforeAll(
          mode === 'deadline'
            ? () => {
                counts.hooks++
                return new Promise(() => {})
              }
            : mode === 'pending' || mode === 'abort-pending'
              ? async () => {
                  counts.hooks++
                  entered.resolve()
                  await release.promise
                  throw errors
                }
              : mode === 'async' || mode === 'primitive-async'
                ? async () => {
                    await Promise.resolve()
                    return hook()
                  }
                : hook
        )
        selected('first unstarted', () => {
          counts.bodies++
        })
        selected('second unstarted', () => {
          counts.bodies++
        })
      })
      const running = file.run({
        signal: controller.signal,
        captureCompletedModuleResult: true,
        ...(mode === 'no-capture' ? {} : { captureCoverageCompletion: true }),
        hookTimeout:
          mode === 'deadline'
            ? 10
            : mode === 'pending' || mode === 'abort-pending'
              ? 0
              : 1000,
        ...(mode === 'parallel' ? { sequence: { hooks: 'parallel' } } : {}),
        onCaseStart() {
          counts.starts++
        },
      })
      if (mode === 'pending' || mode === 'abort-pending') {
        await entered.promise
        assert.equal(file.getCompletedCoverageFailures(), undefined)
        // Timeout zero deliberately has no timed-operation record; actual run state still owns the pending callback.
        assert.equal(file.getOperationSettlement().bounded.pending, 0)
        assert.equal(counts.bodies, 0)
        await assert.rejects(
          file.dispose(),
          /Abort and await the active test file/
        )
        if (mode === 'abort-pending')
          controller.abort(new Error('actual beforeAll pending abort'))
        release.resolve()
      }
      const result = await running
      if (mode === 'late') await new Promise((resolve) => setImmediate(resolve))
      let disposalRejected = false,
        disposalError
      try {
        await file.dispose(
          mode === 'disposal-same'
            ? {
                beforeOwnedWorkerDispose() {
                  throw first
                },
              }
            : undefined
        )
      } catch (e) {
        disposalRejected = true
        disposalError = e
      }
      const completion = file.getCompletedCoverageFailures()
      const positive = [
        'sync',
        'async',
        'repeated',
        'primitive-sync',
        'primitive-async',
        'pending',
      ].includes(mode)
      assert.equal(counts.hooks, 1)
      assert.equal(counts.bodies, 0)
      assert.equal(counts.starts, 0)
      assert.equal(counts.map, mode === 'deadline' ? 0 : 1)
      assert.equal(counts.iterator, 0)
      const expectedReads = ['borrowed', 'missing-map', 'deadline'].includes(
        mode
      )
        ? 0
        : 1
      assert.equal(counts.zero, expectedReads)
      assert.equal(counts.one, expectedReads)
      if (mode === 'borrowed') {
        assert.equal(result.errors.length, 1)
        assert.equal(result.errors[0], borrowed)
      } else if (mode === 'duplicate-fresh') {
        assert.equal(result.errors.length, 2)
        assert.equal(result.errors[0], result.errors[1])
        assert.equal(result.errors[0], firstMapped)
      } else if (mode === 'mixed-borrowed') {
        assert.equal(result.errors.length, 2)
        assert.equal(result.errors[0], firstMapped)
        assert.equal(result.errors[1], borrowed)
      } else if (mode !== 'deadline') {
        assert.equal(result.errors.length, 2)
        assert.notEqual(result.errors[0], result.errors[1])
        result.errors.forEach((f, i) => assert.equal(f.error, values[i]))
      }
      result.errors.forEach((f) =>
        assert.deepEqual(Object.keys(f), ['phase', 'error'])
      )
      if (positive) {
        assert.equal(result.interrupted, false)
        assert.equal(disposalRejected, false)
        assert.equal(completion.length, 2)
        assert.deepEqual(result.errors.map(life.isSettledCoverageFailure), [
          true,
          true,
        ])
        completion.forEach((f, i) => assert.equal(f, result.errors[i]))
      } else assert.equal(completion, undefined)
      if (
        mode === 'no-capture' ||
        mode === 'parallel' ||
        mode === 'fixture' ||
        mode === 'missing-map' ||
        mode === 'deadline'
      )
        assert(result.errors.every((f) => !life.isSettledCoverageFailure(f)))
      if (mode === 'repeated')
        assert.equal(result.errors[0].error, result.errors[1].error)
      if (mode === 'disposal-same') {
        assert(disposalRejected)
        assert.equal(disposalError, first)
      }
      if (mode === 'late') {
        assert.equal(native.length, 1)
        assert.equal(native[0].reason, first)
        assert.equal(native[0].routed, true)
        assert(disposalRejected)
      }
      if (creator) {
        assert(life.isSettledCoverageFailure(borrowed))
        assert.equal(creator.getCompletedCoverageFailures()[0], borrowed)
      }
      if (discarded)
        assert.equal(life.isSettledCoverageFailure(discarded), false)
      const operations = file.getOperationSettlement()
      if (mode !== 'deadline') {
        assert.equal(operations.bounded.pending, 0)
        assert.equal(operations.around.pending, 0)
        assert.equal(operations.pendingHooks, 0)
      } else {
        assert.equal(result.interrupted, true)
        assert(operations.bounded.pending > 0)
      }
      assert.equal(file.canPublishSnapshots(), false)
      assert.deepEqual(
        [first, second].map((e) => Object.getOwnPropertyDescriptors(e)),
        fields
      )
      writeFileSync(
        join(output, 'EVIDENCE.json'),
        JSON.stringify(
          {
            mode,
            counts,
            phases: result.errors.map((f) => f.phase),
            marks: result.errors.map(life.isSettledCoverageFailure),
            interrupted: result.interrupted,
            disposalRejected,
            completionLength: completion?.length,
            creatorStillValid: creator ? true : undefined,
            operations,
            nativeRejections: native.length,
          },
          null,
          2
        ) + '\n'
      )
      writeFileSync(
        join(output, 'CHECKS.json'),
        JSON.stringify(
          {
            mode,
            actualCallbackCarrierOwnership: true,
            noBodyInvocations: true,
            noInventedStarts: true,
            actualOperationJoins: mode !== 'deadline',
            otherStageAndBorrowedVeto: true,
            originalArrayReadsPreserved: true,
            rawErrorsUnchanged: true,
            snapshotPolicyTouched: false,
          },
          null,
          2
        ) + '\n'
      )
    } finally {
      if (mode === 'late')
        process.removeListener('unhandledRejection', rejection)
      try {
        await file.dispose()
      } catch {}
      if (creator) await creator.dispose()
      rmSync(fixture, { recursive: true, force: true })
    }
  }
}
