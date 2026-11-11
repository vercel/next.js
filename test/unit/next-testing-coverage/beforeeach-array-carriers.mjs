import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, name, phase] = process.argv.slice(2)
const consumer = resolve(consumerArg),
  output = resolve(outputArg)
mkdirSync(output, { recursive: true })
if (phase !== 'child') {
  const env = { ...process.env, CI: '1', NODE_ENV: 'development' }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const owner = await runOwnedNode(
    [fileURLToPath(import.meta.url), consumer, output, name, 'child'],
    {
      cwd: consumer,
      env,
      auditDir: join(output, 'owners'),
      timeoutMs: 30000,
    }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'actual Array carrier ownership ' + name)
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const load = createRequire(join(consumer, 'package.json'))
  const runner = load('next/dist/experimental/testing/runner')
  const { isSettledBeforeEachCoverageFailure } = load(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const fixture = mkdtempSync(
    join(consumer, '.next-beforeeach-array-carriers-')
  )
  const filePath = join(fixture, 'contract.test.mjs')
  writeFileSync(filePath, '// actual runner carrier ownership component\n')
  const first = new Error('actual reused Array first'),
    second = new Error('actual reused Array second')
  const fields = [first, second].map((error) =>
    Object.getOwnPropertyDescriptors(error)
  )
  const counts = { map: 0, zero: 0, one: 0, iterator: 0, hooks: 0, bodies: 0 }
  const errors = []
  Object.defineProperty(errors, '0', {
    configurable: true,
    enumerable: true,
    get() {
      counts.zero++
      return first
    },
  })
  Object.defineProperty(errors, '1', {
    configurable: true,
    enumerable: true,
    get() {
      counts.one++
      return second
    },
  })
  let borrowed
  Object.defineProperty(errors, 'map', {
    configurable: true,
    get() {
      counts.map++
      return name === 'borrowed'
        ? function (callback) {
            if (!borrowed)
              borrowed = Reflect.apply(Array.prototype.map, this, [callback])
            return borrowed
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
  if (name === 'substituted') {
    const { createCollector } = load(
      'next/dist/experimental/testing/runner/collector'
    )
    const { runCollected } = load(
      'next/dist/experimental/testing/runner/lifecycle'
    )
    const collector = createCollector('private-array-wrapper', { filePath })
    collector.api.beforeEach(async () => {
      counts.hooks++
      await Promise.resolve()
      throw errors
    })
    collector.api.test('first actual attempt', () => {
      counts.bodies++
    })
    collector.api.test('second actual attempt', () => {
      counts.bodies++
    })
    await collector.settle()
    const operations = { bounded: new Set(), around: new Set() }
    let current
    const result = await runCollected(
      collector.close(),
      {
        runId: 'private-array-wrapper-run',
        signal: new AbortController().signal,
        hookTimeout: 1000,
        testTimeout: 1000,
        captureCoverageCompletion: true,
        runWithCasePhase(phase, callback) {
          const returned = callback()
          return phase === 'beforeEach'
            ? Promise.resolve().then(() => returned)
            : returned
        },
      },
      (value) => {
        current = value
      },
      undefined,
      undefined,
      operations
    )
    assert.equal(current, undefined)
    assert.equal(counts.bodies, 0)
    assert.equal(counts.hooks, 2)
    assert.deepEqual(
      [counts.map, counts.zero, counts.one, counts.iterator],
      [2, 2, 2, 0]
    )
    assert.deepEqual(
      result.cases.map((row) => row.status),
      ['failed', 'failed']
    )
    for (const row of result.cases)
      for (const failure of row.errors)
        assert.equal(
          isSettledBeforeEachCoverageFailure(failure, row.attempt.id),
          false
        )
    assert(operations.bounded.size > 0)
    assert([...operations.bounded].every((operation) => operation.settled))
    assert([...operations.around].every((operation) => operation.settled))
    assert.equal(operations.pendingHooks.size, 0)
    for (let i = 0; i < 2; i++)
      assert.deepEqual(
        Object.getOwnPropertyDescriptors(i ? second : first),
        fields[i]
      )
    writeFileSync(
      join(output, 'CHECKS.json'),
      JSON.stringify(
        {
          name,
          privateWrapperDomain: true,
          actualAttemptCarrierOwnership: true,
          noBodyInvocations: true,
          actualOperationJoins: true,
          exactlyOneAuthoredMapAndMemberReadPerInvocation: true,
          rawErrorsUnchanged: true,
          snapshotPolicyTouched: false,
        },
        null,
        2
      ) + '\n'
    )
    rmSync(fixture, { recursive: true, force: true })
  } else {
    const file = runner.initializeTestFile({
      publicTaskSelection: true,
      fileId: 'actual-array-carriers',
      filePath,
      onUnhandledRejection() {},
      snapshotBodyFailures: true,
      nativeBeforeEachAssertions: true,
      nativeAfterEachAssertions: true,
      nativeBeforeEachCleanupAssertions: true,
      snapshotUpdateMode: 'none',
    })
    try {
      await file.collect(async () => {
        const hook = () => {
          counts.hooks++
          throw errors
        }
        file.api.beforeEach(
          name === 'async' || name === 'substituted'
            ? async () => {
                await Promise.resolve()
                return hook()
              }
            : hook
        )
        if (name === 'other-stage')
          file.api.afterEach(() => {
            throw first
          })
        const test =
          name === 'fixture'
            ? file.api.test.extend({ value: 1 })
            : file.api.test
        test('first actual attempt', () => {
          counts.bodies++
        })
        test('second actual attempt', () => {
          counts.bodies++
        })
      })
      const direct = await file.run({
        runId: 'actual-array-carriers-run',
        signal: new AbortController().signal,
        testTimeout: 1000,
        hookTimeout: 1000,
        ...(name !== 'no-capture' ? { captureCoverageCompletion: true } : {}),
        ...(name === 'parallel' ? { sequence: { hooks: 'parallel' } } : {}),
        ...(name === 'substituted'
          ? {
              runWithCasePhase(phase, callback) {
                const returned = callback()
                return phase === 'beforeEach'
                  ? Promise.resolve().then(() => returned)
                  : returned
              },
            }
          : {}),
      })
      await file.dispose()
      assert.equal(direct.interrupted, false)
      assert.equal(counts.hooks, 2)
      assert.equal(counts.bodies, 0)
      assert.equal(counts.map, 2)
      assert.equal(counts.zero, name === 'borrowed' ? 1 : 2)
      assert.equal(counts.one, name === 'borrowed' ? 1 : 2)
      assert.equal(counts.iterator, 0)
      assert.deepEqual(
        direct.cases.map((row) => row.status),
        ['failed', 'failed']
      )
      const qualified = name === 'sync' || name === 'async'
      const evidence = direct.cases.map((row, index) => {
        const beforeEach = row.errors.filter(
          (error) => error.phase === 'beforeEach'
        )
        assert.equal(beforeEach.length, 2)
        const marked = beforeEach.map((failure) =>
          isSettledBeforeEachCoverageFailure(failure, row.attempt.id)
        )
        assert.deepEqual(marked, [
          qualified ||
            (name === 'borrowed' && index === 0) ||
            name === 'other-stage',
          qualified ||
            (name === 'borrowed' && index === 0) ||
            name === 'other-stage',
        ])
        for (const failure of row.errors) {
          assert.deepEqual(Object.keys(failure), ['phase', 'error'])
          if (failure.phase !== 'beforeEach')
            assert.equal(
              isSettledBeforeEachCoverageFailure(failure, row.attempt.id),
              false
            )
        }
        return {
          attempt: row.attempt,
          marked,
          phases: row.errors.map((error) => error.phase),
        }
      })
      if (name !== 'no-capture') {
        const operations = file.getOperationSettlement()
        assert.equal(operations.bounded.pending, 0)
        assert.equal(operations.around.pending, 0)
        assert.equal(operations.pendingHooks, 0)
        assert(operations.bounded.observed > 0)
        assert.deepEqual(file.getNativeBodySettlement().invocations, [])
        writeFileSync(
          join(output, 'OPERATIONS.json'),
          JSON.stringify({ operations, evidence }, null, 2) + '\n'
        )
      }
      for (let i = 0; i < 2; i++)
        assert.deepEqual(
          Object.getOwnPropertyDescriptors(i ? second : first),
          fields[i]
        )
      assert.equal(file.canPublishSnapshots(), false)
      writeFileSync(
        join(output, 'CHECKS.json'),
        JSON.stringify(
          {
            name,
            actualAttemptCarrierOwnership: true,
            noBodyInvocations: true,
            actualOperationJoins: true,
            exactlyOneAuthoredMapAndMemberReadPerInvocation: true,
            noAuthoredIteratorRead: true,
            rawErrorsUnchanged: true,
            noNewEnumerableCarrierFields: true,
            otherStageAndBorrowedCarriersUnmarked: true,
            snapshotVetoUnchanged: true,
          },
          null,
          2
        ) + '\n'
      )
    } finally {
      await file.dispose()
      rmSync(fixture, { recursive: true, force: true })
    }
  }
}
