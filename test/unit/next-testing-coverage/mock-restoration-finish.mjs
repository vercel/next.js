import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
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
  assertOwnedNodeCompleted(owner, 'actual assertion finish restoration ' + mode)
  assert.equal(owner.status, 0, owner.stderr)
} else if (mode.startsWith('successful-file-')) {
  const load = createRequire(join(consumer, 'package.json'))
  const runner = load('next/dist/experimental/testing/runner')
  const fixture = mkdtempSync(join(consumer, '.next-restoration-success-'))
  const filePath = join(fixture, 'suite.test.mjs')
  writeFileSync(filePath, '// actual successful file cleanup observability\n')
  const requested = mode === 'successful-file-requested'
  const file = runner.initializeTestFile({
    fileId: mode,
    filePath,
    publicTaskSelection: true,
    captureCollectionCoverage: true,
    ...(requested ? { captureCollectionRestoration: true } : {}),
    snapshotUpdateMode: 'none',
  })
  const originalFreeze = Object.freeze
  let freezeCalls = 0,
    bodies = 0
  try {
    await file.collect(() => {
      runner
        .getAssertionRuntime()
        .spies.spyOn(Object, 'freeze')
        .mockImplementation(function (value) {
          freezeCalls++
          return Reflect.apply(originalFreeze, this, [value])
        })
      file.api.test('actual successful body', () => {
        bodies++
      })
    })
    const result = await file.run({ signal: new AbortController().signal })
    assert.equal(bodies, 1)
    assert.equal(result.errors.length, 0)
    assert.equal(result.cases.length, 1)
    assert.equal(result.cases[0].errors.length, 0)
    const before = freezeCalls
    await file.dispose()
    assert.equal(
      freezeCalls - before,
      0,
      'ordinary successful disposal must not activate the restoration observer'
    )
    assert.equal(file.getCompletedCollectionRestorationFailure?.(), undefined)
    writeFileSync(
      join(output, 'VERIFIED.json'),
      JSON.stringify(
        {
          mode,
          actualSuccessfulFile: true,
          originalCleanupObservables: true,
          observerNotActivated: true,
          rawErrorFieldsUnchanged: true,
          actualBodyCount: bodies,
          freezeCallsDuringDispose: freezeCalls - before,
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    await file.dispose()
    rmSync(fixture, { recursive: true, force: true })
  }
} else if (mode.startsWith('file-')) {
  const load = createRequire(join(consumer, 'package.json'))
  const runner = load('next/dist/experimental/testing/runner')
  const fixture = mkdtempSync(join(consumer, '.next-restoration-file-'))
  const filePath = join(fixture, 'suite.test.mjs')
  writeFileSync(
    filePath,
    '// actual sole load and independent disposal stages\n'
  )
  const failure = new Error(
    'same actual cause across load, restore and cleanup'
  )
  const before = Object.getOwnPropertyDescriptors(failure)
  const requested = mode !== 'file-unrequested'
  const file = runner.initializeTestFile({
    fileId: 'actual-restoration-file-' + mode,
    filePath,
    captureCollectionCoverage: true,
    ...(requested ? { captureCollectionRestoration: true } : {}),
    snapshotUpdateMode: 'none',
  })
  let blocked = false,
    restoreCalls = 0,
    caught,
    thrown = false
  try {
    await assert.rejects(
      file.collect(() => {
        if (mode !== 'file-undefined-cleanup') {
          const target = new Proxy(
            {
              method() {
                return 1
              },
            },
            {
              defineProperty(object, key, descriptor) {
                if (blocked) {
                  restoreCalls++
                  throw failure
                }
                return Reflect.defineProperty(object, key, descriptor)
              },
            }
          )
          runner.getAssertionRuntime().spies.spyOn(target, 'method')
          blocked = true
        }
        throw failure
      }),
      (error) => error === failure
    )
    assert.equal(file.getCompletedCollectionRestorationFailure?.(), undefined)
    try {
      await file.dispose(
        mode === 'file-undefined-cleanup'
          ? {
              beforeOwnedWorkerDispose() {
                // eslint-disable-next-line no-throw-literal -- actual primitive cleanup failure control
                throw undefined
              },
            }
          : mode === 'file-mixed-same-error'
            ? {
                beforeOwnedWorkerDispose() {
                  throw failure
                },
              }
            : undefined
      )
    } catch (error) {
      caught = error
      thrown = true
    }
    assert(thrown)
    const observed = file.getCompletedCollectionRestorationFailure?.()
    if (mode === 'file-plain') {
      assert(observed && Object.isFrozen(observed))
      assert.equal(observed.collectionError, failure)
      assert.equal(observed.disposalError, caught)
      assert(caught instanceof globalThis.AggregateError)
      assert(caught.errors.length >= 2)
      assert(caught.errors.every((error) => error === failure))
      assert.equal(restoreCalls, 2)
    } else assert.equal(observed, undefined)
    if (mode === 'file-undefined-cleanup') assert.equal(caught, undefined)
    assert.equal(
      Object.hasOwn(file, 'getCompletedCollectionRestorationFailure'),
      requested
    )
    assert.equal(file.getCompletedCollectionCoverageFailure(), undefined)
    assert.equal(file.getCompletedCoverageFailures(), undefined)
    assert.equal(file.getOperationSettlement(), undefined)
    assert.equal(file.getNativeBodySettlement(), undefined)
    assert.deepEqual(Object.getOwnPropertyDescriptors(failure), before)
    writeFileSync(
      join(output, 'VERIFIED.json'),
      JSON.stringify(
        {
          mode,
          actualSoleLoadFailure: true,
          actualFileDisposeStillThrows: true,
          noInventedBodyOrOperation: true,
          ordinaryCollectionCompletionWithheld: true,
          exactRestorationPair: mode === 'file-plain',
          independentUndefinedCleanupUnmarked:
            mode === 'file-undefined-cleanup',
          sameErrorIndependentStageUnmarked: mode === 'file-mixed-same-error',
          unrequestedGetterAbsent: !requested,
          rawErrorFieldsUnchanged: true,
          restoreCalls,
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    blocked = false
    await file.dispose()
    load('next/dist/compiled/next-test-primitives').spies.restoreAllMocks()
    rmSync(fixture, { recursive: true, force: true })
  }
} else {
  const load = createRequire(join(consumer, 'package.json'))
  const primitivePath = load.resolve('next/dist/compiled/next-test-primitives')
  const primitive = load(primitivePath)
  const originalLoad = Module._load
  if (mode === 'missing-sdk' || mode === 'malformed-sdk') {
    Module._load = function (request, parent, isMain) {
      const value = Reflect.apply(originalLoad, this, arguments)
      if (Module._resolveFilename(request, parent, isMain) !== primitivePath)
        return value
      const replacement = Object.create(value)
      Object.defineProperty(replacement, 'spies', {
        value: {
          ...value.spies,
          createMockRestorationObservation:
            mode === 'missing-sdk'
              ? undefined
              : () =>
                  Object.freeze({
                    run(callback) {
                      return callback()
                    },
                    take() {
                      return Object.freeze([])
                    },
                  }),
        },
      })
      return replacement
    }
  }
  let createAssertionRuntime
  try {
    ;({ createAssertionRuntime } = load(
      'next/dist/experimental/testing/assertions'
    ))
  } finally {
    Module._load = originalLoad
  }
  const fixture = mkdtempSync(join(consumer, '.next-restoration-finish-'))
  const filePath = join(fixture, 'suite.test.mjs')
  writeFileSync(
    filePath,
    '// actual assertion file/collection cleanup component\n'
  )
  const failure = new Error(
    'same actual restoration and independent-stage cause'
  )
  const before = Object.getOwnPropertyDescriptors(failure)
  let current,
    blocked = false,
    restoreCalls = 0,
    caught,
    thrown = false
  const requested = !['unrequested', 'unrequested-eligibility-getter'].includes(
    mode
  )
  const eligibilityFailure = new Error(
    'actual private eligibility observer failed'
  )
  let eligibilityCalls = 0,
    eligibilityReads = 0
  const runtimeOptions = {
    testPath: filePath,
    ...(requested ? { captureCollectionRestoration: true } : {}),
    getCurrentAttempt: () => undefined,
    getCurrentCollection: () => current,
    snapshotUpdateMode: 'none',
  }
  if (mode.startsWith('eligibility-'))
    runtimeOptions.shouldCaptureCollectionRestoration =
      mode === 'eligibility-malformed'
        ? 'not a callback'
        : () => {
            eligibilityCalls++
            if (mode === 'eligibility-throw') throw eligibilityFailure
            if (mode === 'eligibility-same-error') throw failure
            return mode === 'eligibility-true'
              ? true
              : mode === 'eligibility-truthy'
                ? 'true'
                : false
          }
  if (mode === 'unrequested-eligibility-getter')
    Object.defineProperty(
      runtimeOptions,
      'shouldCaptureCollectionRestoration',
      {
        get() {
          eligibilityReads++
          throw eligibilityFailure
        },
      }
    )
  const runtime = await createAssertionRuntime(runtimeOptions)
  let mock
  try {
    assert.equal(
      Object.hasOwn(runtime, 'getCompletedMockRestorationFailure'),
      requested
    )
    current = {
      id: 'actual-finish-collection',
      name: 'actual finish collection',
    }
    const collection = runtime.beginCollection(current)
    const target = new Proxy(
      {
        method() {
          return 1
        },
      },
      {
        defineProperty(object, key, descriptor) {
          if (blocked) {
            restoreCalls++
            throw failure
          }
          return Reflect.defineProperty(object, key, descriptor)
        },
      }
    )
    mock = runtime.spies.spyOn(target, 'method')
    if (mode === 'override')
      mock.mockRestore = () => {
        throw failure
      }
    if (mode === 'reset')
      mock.mockReset = () => {
        throw failure
      }
    if (mode === 'clear')
      mock.mockClear = () => {
        throw failure
      }
    blocked = true
    await collection.finalize()
    await collection.dispose()
    current = undefined
    try {
      await runtime.finishFile()
    } catch (error) {
      caught = error
      thrown = true
    }
    assert(thrown)
    assert(caught instanceof globalThis.AggregateError)
    assert.equal(caught.message, 'Test assertion file cleanup failed')
    assert(caught.errors.length >= 2)
    if (mode === 'eligibility-throw' || mode === 'eligibility-same-error') {
      assert.equal(
        caught.errors[0],
        mode === 'eligibility-throw' ? eligibilityFailure : failure
      )
      assert(caught.errors.slice(1).every((error) => error === failure))
      assert.equal(caught.errors.length, 3)
    } else if (mode === 'eligibility-malformed') {
      assert(caught.errors[0] instanceof TypeError)
      assert.equal(
        caught.errors[0].message,
        'Invalid restoration eligibility observer.'
      )
      assert(caught.errors.slice(1).every((error) => error === failure))
    } else assert(caught.errors.every((error) => error === failure))
    if (mode.startsWith('eligibility-'))
      assert.equal(eligibilityCalls, mode === 'eligibility-malformed' ? 0 : 1)
    assert.equal(eligibilityReads, 0)
    assert.deepEqual(Object.getOwnPropertyDescriptors(failure), before)
    const observed = runtime.getCompletedMockRestorationFailure?.()
    if (mode === 'plain' || mode === 'eligibility-true') {
      assert(observed && Object.isFrozen(observed))
      assert.equal(observed.error, caught)
      assert.equal(restoreCalls, 2)
      assert.equal(observed.occurrences.length, 2)
      assert.deepEqual(
        observed.occurrences.map(({ index }) => index),
        [0, 1]
      )
      const calls = observed.occurrences.map(({ calls }) => calls)
      for (const list of calls) {
        assert(Object.isFrozen(list) && Object.isFrozen(list[0]))
        assert.equal(list.length, 1)
        assert.equal(list[0].mock, mock)
        assert.equal(list[0].reason, failure)
        assert.equal(list[0].status, 'rejected')
      }
      assert.notEqual(calls[0][0], calls[1][0])
      assert.equal(calls[0][0].restore, calls[1][0].restore)
    } else assert.equal(observed, undefined)
    writeFileSync(
      join(output, 'VERIFIED.json'),
      JSON.stringify(
        {
          mode,
          actualCollectionScope: true,
          actualFinishStillThrows: true,
          originalErrorsRetained: true,
          rawErrorFieldsUnchanged: true,
          exactFreshRestorationOccurrences:
            mode === 'plain' || mode === 'eligibility-true',
          independentOrMissingProducerUnmarked:
            mode !== 'plain' && mode !== 'eligibility-true',
          eligibilityCalls,
          eligibilityReads,
          callbackFailureRemainsIndependent: [
            'eligibility-throw',
            'eligibility-same-error',
            'eligibility-malformed',
          ].includes(mode),
          restoreCalls,
          errors: caught.errors.length,
          noBodyOrWorkerObservation: true,
          fileDisposalAuthorizationImplemented: false,
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    blocked = false
    current = undefined
    await runtime.finishFile()
    primitive.spies.restoreAllMocks()
    rmSync(fixture, { recursive: true, force: true })
  }
}
