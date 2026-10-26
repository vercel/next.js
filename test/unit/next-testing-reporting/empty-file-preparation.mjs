import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
require('next/dist/server/node-environment-baseline')
const {
  createCollector,
} = require('next/dist/experimental/testing/runner/collector')
const {
  runCollected,
} = require('next/dist/experimental/testing/runner/lifecycle')
const {
  initializeTestFile,
  getAssertionRuntime,
} = require('next/dist/experimental/testing/runner')
const [mode, output] = process.argv.slice(2)
const c = createCollector('owned:preparation'),
  events = []
let hooks = 0,
  fixtures = 0,
  bodies = 0,
  actualFile,
  rootSuite
c.api.beforeAll(() => {
  hooks++
})
c.api.afterAll(() => {
  hooks++
})
if (mode === 'nonempty')
  c.api.test('body', () => {
    bodies++
  })
if (mode === 'all-skip')
  c.api.test.skip('skipped', () => {
    bodies++
  })
if (mode === 'nested') c.api.describe('empty', () => {})
const controller = new AbortController()
const expectedPath = '/owned/empty.case.mjs'
const result = await runCollected(
  c.close(),
  {
    runId: 'owned-preparation',
    signal: controller.signal,
    filePath: expectedPath,
    ...(mode === 'absent'
      ? {}
      : { prepareEmptyPublicFile: mode === 'truthy' ? 'true' : true }),
    passWithNoTests: mode === 'pass',
    async onCollected(file) {
      actualFile = file
      events.push('collected')
      assert.equal(file.result, undefined)
      if (mode === 'cancelled')
        controller.abort(new Error('owned existing abort'))
    },
    onSuiteEnd(suite, file) {
      events.push('suite-end')
      if (suite.suiteId === 'owned:preparation') {
        rootSuite = suite
        assert.equal(file, actualFile)
      }
    },
  },
  () => {},
  {
    beginFileFixtures() {
      fixtures++
      events.push('fixture')
      return {
        finalize() {
          events.push('fixture-finalize')
        },
        dispose() {
          events.push('fixture-dispose')
        },
      }
    },
    beginHook() {
      return { async finalize() {}, async dispose() {} }
    },
    setActiveHook() {},
  }
)
if (['empty', 'identity'].includes(mode)) {
  assert.equal(result.errors.length, 1)
  const failure = result.errors[0]
  assert.equal(failure.phase, 'runtime')
  assert.equal(
    failure.error.message,
    'No test suite found in file ' + expectedPath
  )
  assert.equal(rootSuite.errors[0], failure)
  assert.equal(rootSuite.status, 'failed')
  assert.equal(actualFile.result.state, 'fail')
  assert.equal(actualFile.result.errors[0].message, failure.error.message)
  assert.equal(actualFile.tasks.length, 0)
  assert.equal(hooks, 0)
  assert.equal(fixtures, 0)
  assert.equal(bodies, 0)
  assert.deepEqual(events, ['collected', 'suite-end'])
} else if (mode === 'pass') {
  assert.equal(result.errors.length, 0)
  assert.equal(hooks, 2)
  assert.equal(fixtures, 1)
  assert.equal(rootSuite.status, 'passed')
} else if (mode === 'nonempty') {
  assert.equal(result.errors.length, 0)
  assert.equal(bodies, 1)
  assert.equal(hooks, 2)
  assert.equal(fixtures, 1)
} else if (mode === 'all-skip') {
  assert.equal(actualFile.tasks.length, 1)
  assert.equal(result.errors.length, 0)
  assert.equal(bodies, 0)
  assert.equal(fixtures, 1)
} else if (mode === 'nested') {
  assert.equal(actualFile.tasks.length, 1)
  assert(
    result.errors.every(
      (f) => !f.error.message.startsWith('No test suite found in file')
    )
  )
  assert.equal(fixtures, 1)
} else if (mode === 'cancelled') {
  assert.equal(result.interrupted, true)
  assert(
    result.errors.every(
      (f) => !f.error.message.startsWith('No test suite found in file')
    )
  )
} else {
  assert.equal(result.errors[0].error.message, 'No test found in suite ')
  assert.equal(fixtures, 1)
}
if (mode === 'identity') {
  const file = initializeTestFile({
    fileId: 'owned:api',
    filePath: expectedPath,
    publicTaskSelection: true,
    prepareEmptyPublicFile: true,
    snapshotUpdateMode: 'none',
  })
  await file.collect(async () => {
    Object.defineProperty(globalThis, 'owned-empty-disposal', {
      configurable: true,
      writable: true,
      value: 0,
    })
    getAssertionRuntime().utilities.stubGlobal('owned-empty-disposal', 1)
    Object.defineProperty(globalThis, 'owned-empty-disposal', {
      configurable: false,
      value: 1,
    })
  })
  const run = await file.run({
    runId: 'owned-api',
    signal: new AbortController().signal,
  })
  assert.equal(run.errors.length, 1)
  assert.equal(
    run.errors[0].error.message,
    'No test suite found in file ' + expectedPath
  )
  let failure
  try {
    await file.dispose()
  } catch (error) {
    failure = error
  }
  assert(failure)
  assert.equal(
    run.errors[0].error.message,
    'No test suite found in file ' + expectedPath
  )
}
writeFileSync(
  output,
  JSON.stringify(
    {
      mode,
      actualFinalizedChildren: actualFile.tasks.length,
      errorMessages: result.errors.map((f) => f.error.message),
      hooks,
      fixtures,
      bodies,
      events,
      actualFileRootResultIdentityHeld: true,
      originalScopesJoined: true,
    },
    null,
    2
  ) + '\n'
)
