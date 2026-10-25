const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os')
const runner = require(process.argv[2])
async function main() {
  const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'next-public-finished-setup-failure-')
    ),
    events = [],
    setup = new Error('actual beginAttempt setup failure'),
    manual = new Error('actual manual completion failure')
  setup.stack = ''
  manual.stack = ''
  const file = runner.initializeTestFile({
    fileId: 'actual-setup-failure',
    filePath: path.join(dir, 'actual.test.mjs'),
    snapshotBodyFailures: true,
    nativeBeforeEachAssertions: true,
    nativeAfterEachAssertions: true,
    nativeBeforeEachCleanupAssertions: true,
    resourceLifetime: 'file',
    onUnhandledRejection(reason) {
      throw reason
    },
  })
  try {
    await file.collect(async () => {
      file.api.test('setup fails with successful raw completion', () => {
        events.push('unexpected-body-first')
      })
      file.api.test('setup fails with throwing raw completion', () => {
        events.push('unexpected-body-second')
      })
      file.api.test('next ordinary actual attempt', () => {
        events.push('next-body')
      })
    })
    const scopes = [],
      disposed = [],
      runtime = runner.getAssertionRuntime(),
      begin = runtime.beginAttempt
    runtime.beginAttempt = function (...args) {
      const scope = begin(...args)
      scopes.push(scope)
      const index = scopes.length - 1,
        dispose = scope.dispose
      disposed[index] = 0
      scope.dispose = async function (...values) {
        try {
          return await dispose(...values)
        } finally {
          disposed[index]++
        }
      }
      return scope
    }
    const result = await file.run({
      runId: 'actual-setup-failure',
      signal: new AbortController().signal,
      captureCompletedModuleResult: true,
      beginAttempt(context) {
        assert.equal(typeof scopes.at(-1).invokeFinishedCallback, 'function')
        if (context.name === 'next ordinary actual attempt') return
        context.task.onFinished = [
          () => {
            events.push(context.name)
            if (context.name === 'setup fails with throwing raw completion')
              throw manual
          },
        ]
        throw setup
      },
    })
    await file.dispose()
    assert.deepEqual(events, ['next-body'])
    assert.deepEqual(disposed, [1, 1, 1])
    assert.equal(scopes.length, 3)
    assert.deepEqual(
      result.cases.map((c) => c.status),
      ['failed', 'failed', 'passed']
    )
    for (const value of result.cases.slice(0, 2)) {
      assert.equal(value.errors.length, 1)
      assert.equal(value.errors[0].error, setup)
      assert.equal(value.errors[0].phase, 'runtime')
    }
    assert.equal(result.cases[2].errors.length, 0)
    const rows = {
      events,
      actualScopes: scopes.length,
      cases: result.cases.map((c) => ({
        name: c.name,
        status: c.status,
        errors: c.errors.map((e) => ({
          phase: e.phase,
          message: e.error?.message,
        })),
      })),
    }
    assert.equal(rows.cases.length, 3)
    console.log(
      JSON.stringify({
        actualScopes: 3,
        actualScopeDisposals: disposed,
        setupErrorIdentityPreserved: true,
        completionCallbacksNotInvoked: true,
        nextAttemptPassed: true,
        secondaryFailureAbsent: true,
      })
    )
  } finally {
    try {
      await file.dispose()
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
