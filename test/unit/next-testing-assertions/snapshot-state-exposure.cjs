const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')

;(async () => {
  const root = path.resolve(process.argv[2] || process.cwd())
  const load = createRequire(path.join(root, 'package.json'))
  const source = process.argv.includes('--source')
  const next = source
    ? path.join(root, 'packages/next')
    : path.dirname(load.resolve('next/package.json'))
  const { createAssertionRuntime } = require(
    next + '/dist/experimental/testing/assertions'
  )
  const { SnapshotClient, NodeSnapshotEnvironment } = require(
    next + '/dist/compiled/next-test-primitives'
  )
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'next-snapshot-state-')
  )
  const rows = []
  const originalRead = SnapshotClient.prototype.getSnapshotState
  let actualRead
  SnapshotClient.prototype.getSnapshotState = function (...args) {
    const value = Reflect.apply(originalRead, this, args)
    actualRead = value
    return value
  }
  const globalExpect = Symbol.for('expect-global')
  const previousGlobal = Object.getOwnPropertyDescriptor(
    globalThis,
    globalExpect
  )
  try {
    for (const mode of [
      'lifecycle',
      'retry',
      'failed-match',
      'closed',
      'collect-only',
      'setup-error',
      'setup-undefined',
    ]) {
      let active, activeHook, collection, scope, runtime
      let expectedSnapshot, retainedState
      const failure =
        mode === 'setup-undefined'
          ? undefined
          : new Error('actual snapshot setup failure')
      const options = {
        testPath: path.join(directory, mode + '.test.mjs'),
        getCurrentAttempt: () => active,
        getCurrentHook: () => activeHook,
        getCurrentCollection: () => collection,
      }
      if (mode === 'collect-only') options.collectOnly = true
      if (mode.startsWith('setup-')) {
        const environment = new NodeSnapshotEnvironment()
        environment.resolvePath = () => Promise.reject(failure)
        options.snapshotOptions = {
          updateSnapshot: 'none',
          snapshotEnvironment: environment,
        }
        let rejected = false
        await createAssertionRuntime(options).then(
          () => assert.fail('Expected the actual environment failure'),
          (error) => {
            rejected = true
            assert.equal(error, failure)
          }
        )
        assert.equal(rejected, true)
        assert.deepEqual(
          Object.getOwnPropertyDescriptor(globalThis, globalExpect),
          previousGlobal
        )
        rows.push({
          mode,
          actualSetupFailure: true,
          rawUndefinedPreserved: true,
        })
        continue
      }
      runtime = await createAssertionRuntime(options)
      async function closeScope() {
        await scope.finalize()
        await scope.dispose()
        scope = undefined
        active = undefined
        activeHook = undefined
        collection = undefined
      }
      try {
        collection = { id: mode + '-file', name: mode }
        scope = runtime.beginCollection(collection)
        retainedState = runtime.expect.getState()
        assert.equal(Object.hasOwn(retainedState, 'snapshotState'), false)
        await closeScope()
        if (mode === 'collect-only') {
          await runtime.finishFile()
          assert.throws(
            () => runtime.expect.getState(),
            /Cannot access a disposed assertion scope/
          )
          rows.push({ mode, collectionAbsence: true, closedGuard: true })
          continue
        }
        activeHook = { id: mode + '-before', name: mode, hook: 'beforeAll' }
        scope = runtime.beginHook(activeHook)
        assert.equal(runtime.expect.getState(), retainedState)
        assert.equal(Object.hasOwn(retainedState, 'snapshotState'), false)
        await closeScope()
        const attempts = mode === 'retry' ? 2 : mode === 'lifecycle' ? 2 : 1
        for (let index = 0; index < attempts; index++) {
          active = {
            id: mode + '-attempt-' + index,
            testId: mode === 'retry' ? 'retry' : 'case-' + index,
            name: mode + ' case',
          }
          scope = runtime.beginAttempt(active)
          const state = runtime.expect.getState()
          const snapshot = state.snapshotState
          assert.equal(state, retainedState)
          assert.equal(snapshot, actualRead)
          assert.equal(
            Object.getPrototypeOf(snapshot).constructor.name,
            'SnapshotState'
          )
          assert.deepEqual(
            Object.getOwnPropertyDescriptor(state, 'snapshotState'),
            {
              value: snapshot,
              enumerable: true,
              writable: true,
              configurable: true,
            }
          )
          if (expectedSnapshot) assert.equal(snapshot, expectedSnapshot)
          expectedSnapshot = snapshot
          const local = runtime.createExpect({
            id: active.testId,
            fullTestName: active.name,
          })
          assert.notEqual(local.getState(), state)
          assert.equal(local.getState().snapshotState, snapshot)
          const before = Number(snapshot.matched)
          if (mode === 'failed-match') {
            assert.throws(() =>
              runtime.expect('actual').toMatchInlineSnapshot('"expected"')
            )
            assert.equal(Number(snapshot.unmatched), 1)
          } else {
            runtime
              .expect('stable snapshot')
              .toMatchInlineSnapshot('"stable snapshot"')
            assert.equal(Number(snapshot.matched), before + 1)
          }
          await closeScope()
        }
        activeHook = { id: mode + '-after', name: mode, hook: 'afterAll' }
        scope = runtime.beginHook(activeHook)
        assert.equal(runtime.expect.getState(), retainedState)
        assert.equal(retainedState.snapshotState, expectedSnapshot)
        await closeScope()
        await runtime.finishFile()
        assert.equal(retainedState.snapshotState, expectedSnapshot)
        assert.throws(
          () => runtime.expect.getState(),
          /Cannot access a disposed assertion scope/
        )
        rows.push({
          mode,
          actualPrimitiveObject: true,
          collectionAndBeforeAllAbsent: true,
          ownDataDescriptor: true,
          sharedSnapshotAcrossDistinctStates: true,
          afterAllIdentity: true,
          actualCounterRead: true,
          closedGuard: true,
        })
      } finally {
        if (scope) {
          await scope.finalize().catch(() => {})
          await scope.dispose().catch(() => {})
        }
        active = activeHook = collection = undefined
        await runtime.finishFile().catch(() => {})
      }
      assert.deepEqual(
        Object.getOwnPropertyDescriptor(globalThis, globalExpect),
        previousGlobal
      )
    }
    assert.equal(rows.length, 7)
    process.stdout.write(
      JSON.stringify({
        controls: 7,
        actualSDKReadIdentity: true,
        noCollectionOrBeforeAllInjection: true,
        realCounterAndRetryBehavior: true,
        rawSetupFailureAndUndefined: true,
        cleanupGuardsAndGlobalRestoration: true,
      }) + '\n'
    )
  } finally {
    SnapshotClient.prototype.getSnapshotState = originalRead
    await fs.rm(directory, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
