const assert = require('node:assert/strict')
const { it } = require('node:test')
const {
  createCollector,
} = require('next/dist/experimental/testing/runner/collector')
const {
  runCollected,
} = require('next/dist/experimental/testing/runner/lifecycle')
const {
  createAsyncScope,
} = require('next/dist/experimental/testing/runner/async-context')
const {
  clientDeclarations,
} = require('next/dist/experimental/testing/client/collection')
const {
  createClientResultCollector,
} = require('next/dist/experimental/testing/client/results')
const {
  TestFakeTimers,
} = require('next/dist/experimental/testing/assertions/fake-timers')

it('reports real case and suite durations while fake Date crosses lifecycle boundaries', async () => {
  const originalDate = globalThis.Date
  const originalTimeout = globalThis.setTimeout
  const realNow = originalDate.now.bind(originalDate)
  const clock = new TestFakeTimers({
    global: globalThis,
    config: { now: 4000 },
  })
  const late = []
  const collection = createAsyncScope(
    { kind: 'collection', context: { id: 'collection', name: 'clock file' } },
    (error) => late.push(error)
  )
  let pendingFired = false
  const observed = []
  let collector
  collection.run(() => {
    collector = createCollector('clock-file')
    collector.api.describe('first suite', () => {
      collector.api.test('leaves fake Date active', () => {
        clock.useFakeTimers()
        setTimeout(() => {
          pendingFired = true
        }, 50)
        observed.push(Date.now())
      })
    })
    collector.api.describe('second suite', () => {
      collector.api.test('sees and moves the retained clock', () => {
        observed.push(Date.now())
        clock.setSystemTime(4_000_000_000_000)
        observed.push(Date.now())
      })
    })
    collector.api.afterAll(() => clock.useRealTimers())
  })
  await collection.run(() => collector.settle())
  const root = collector.close()
  collection.close()
  const report = createClientResultCollector(
    {
      entryId: root.id,
      revision: 'clock-revision',
      client: { sourceFile: '/clock.test.mjs' },
    },
    { runId: 'clock-run' }
  )
  report.accept({ type: 'collected', declarations: clientDeclarations(root) })
  const cases = [],
    suites = []
  const started = realNow()
  try {
    const result = await runCollected(
      root,
      {
        runId: 'clock-run',
        signal: new AbortController().signal,
        onLateFailure: (error) => late.push(error),
        onCaseStart(context) {
          report.accept({
            type: 'case-start',
            context: {
              id: context.id,
              fileId: context.fileId,
              testId: context.testId,
              name: context.name,
              retry: context.retry,
              repeat: context.repeat,
            },
          })
        },
        onCaseEnd(result) {
          cases.push(result)
          report.accept({ type: 'case-end', result })
        },
        onSuiteEnd(result) {
          suites.push(result)
          report.accept({ type: 'suite-end', result })
        },
      },
      () => {}
    )
    assert.deepEqual(result.errors, [])
    assert.equal(result.interrupted, false)
    assert.deepEqual(
      result.cases.map((row) => row.status),
      ['passed', 'passed']
    )
    assert.deepEqual(observed, [4000, 4000, 4_000_000_000_000])
    assert.equal(cases.length, 2)
    assert.equal(suites.length, 3)
    const elapsed = realNow() - started
    for (const row of [...cases, ...suites]) {
      assert.ok(Number.isFinite(row.durationMs))
      assert.ok(row.durationMs >= 0)
      assert.ok(row.durationMs <= elapsed)
    }
    report.accept({
      type: 'complete',
      status: 'passed',
      interrupted: false,
      caseCount: 2,
      updates: [],
    })
    assert.equal(report.result().status, 'passed')
    assert.equal(globalThis.Date, originalDate)
    assert.equal(globalThis.setTimeout, originalTimeout)
    assert.equal(pendingFired, false)
    assert.deepEqual(late, [])
    console.log(
      JSON.stringify({
        observed,
        caseDurations: cases.map((row) => row.durationMs),
        suiteDurations: suites.map((row) => row.durationMs),
        elapsed,
        collectorAccepted: true,
        globalsRestored: true,
      })
    )
  } finally {
    clock.dispose()
    collection.close()
    assert.equal(globalThis.Date, originalDate)
    assert.equal(globalThis.setTimeout, originalTimeout)
  }
})
