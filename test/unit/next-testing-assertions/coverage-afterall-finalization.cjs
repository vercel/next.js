const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')

;(async () => {
  const consumer = path.resolve(process.argv[2] || process.cwd())
  const source = process.argv.includes('--source')
  const load = createRequire(path.join(consumer, 'package.json'))
  const root = source
    ? path.join(consumer, 'packages/next')
    : path.dirname(load.resolve('next/package.json'))
  const { createAssertionRuntime } = require(
    root + '/dist/experimental/testing/assertions'
  )
  const { createCollector } = require(
    root + '/dist/experimental/testing/runner/collector'
  )
  const { runCollected, isSettledAuthoredAfterAllFailure } = require(
    root + '/dist/experimental/testing/runner/lifecycle'
  )
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'next-coverage-afterall-')
  )
  const rows = []
  try {
    for (const [role, enabled, reused] of [
      ['afterAll', true, false],
      ['afterAll', false, false],
      ['beforeAll', true, false],
      ['afterAll', true, true],
    ]) {
      let activeHook
      let capture = false
      const runtime = await createAssertionRuntime({
        testPath: path.join(directory, `case-${rows.length}.test.mjs`),
        getCurrentAttempt: () => undefined,
        getCurrentHook: () => activeHook,
        captureCoverageCompletion: () => capture,
      })
      const collector = createCollector('actual-finalizer-' + rows.length)
      const privateReads = []
      let actualError, originalFields
      collector.api.test('completed body', () => {})
      collector.api[role](() => {
        void runtime.expect(Promise.resolve(1)).resolves.toBe(2)
      })
      await collector.settle()
      capture = enabled
      try {
        const result = await runCollected(
          collector.close(),
          {
            runId: 'finalizer-' + rows.length,
            signal: new AbortController().signal,
            captureCoverageCompletion: enabled,
          },
          () => {},
          {
            setActiveHook(context) {
              activeHook = context
            },
            beginHook(context) {
              const scope = runtime.beginHook(context)
              assert.equal(
                scope.isSettledCoverageFinalizationFailure(undefined),
                false
              )
              return {
                async finalize() {
                  try {
                    await scope.finalize()
                  } catch (error) {
                    actualError = error
                    originalFields = Object.getOwnPropertyDescriptors(error)
                    throw error
                  }
                },
                isSettledCoverageFinalizationFailure(error) {
                  const result =
                    scope.isSettledCoverageFinalizationFailure(error)
                  privateReads.push(result)
                  return result
                },
                async dispose() {
                  await scope.dispose()
                  assert.equal(
                    scope.isSettledCoverageFinalizationFailure(actualError),
                    false
                  )
                  if (reused && actualError) throw actualError
                },
              }
            },
          }
        )
        assert.equal(result.interrupted, false)
        assert.equal(result.errors.length, reused ? 2 : 1)
        assert.equal(result.errors[0].error, actualError)
        assert.deepEqual(
          result.errors.map(isSettledAuthoredAfterAllFailure),
          enabled && role === 'afterAll'
            ? reused
              ? [true, false]
              : [true]
            : [false]
        )
        assert.deepEqual(
          Object.getOwnPropertyDescriptors(actualError),
          originalFields
        )
        if (reused) assert.equal(result.errors[1].error, actualError)
        rows.push({
          role,
          enabled,
          reused,
          completed: true,
          rawErrorUnchanged: true,
          carrierMarks: result.errors.map(isSettledAuthoredAfterAllFailure),
          privateReads,
        })
      } finally {
        activeHook = undefined
        await runtime.finishFile()
      }
    }
    console.log(JSON.stringify({ actualAssertionRuntime: true, rows }))
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
