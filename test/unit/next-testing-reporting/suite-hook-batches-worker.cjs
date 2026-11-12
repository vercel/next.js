const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const driver = process.argv[2] === '--driver'
const [project, output] = process.argv.slice(driver ? 3 : 2)
assert(project && output)

async function main() {
  fs.mkdirSync(output, { recursive: true })
  if (!driver) {
    const { runOwnedNode, assertOwnedNodeCompleted } = await import(
      pathToFileURL(
        path.join(
          project,
          'test/e2e/app-dir/next-testing-package/process-supervisor.mjs'
        )
      ).href
    )
    const owned = await runOwnedNode(
      [__filename, '--driver', project, output],
      {
        cwd: project,
        env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' },
        auditDir: path.join(output, 'owners'),
        timeoutMs: 30000,
      }
    )
    fs.writeFileSync(
      path.join(output, 'OWNER.json'),
      JSON.stringify(owned, null, 2) + '\n'
    )
    fs.writeFileSync(path.join(output, 'stdout.log'), owned.stdout)
    fs.writeFileSync(path.join(output, 'stderr.log'), owned.stderr)
    assertOwnedNodeCompleted(
      owned,
      'actual Suite and Hook reporter batch transport'
    )
    assert.equal(owned.status, 0, owned.stderr)
    console.log(owned.stdout.trim())
    return
  }
  const req = createRequire(path.join(project, 'package.json'))
  const next = path.dirname(req.resolve('next/package.json'))
  req(next + '/dist/server/node-environment-baseline')
  const { openCustomReporters } = req(
    next + '/dist/experimental/testing/reporting/custom-reporter'
  )
  const { createCollector } = req(
    next + '/dist/experimental/testing/runner/collector'
  )
  const { runCollected } = req(
    next + '/dist/experimental/testing/runner/lifecycle'
  )
  const { createReporterTaskUpdates } = req(
    next + '/dist/experimental/testing/reporting/task-updates'
  )
  const { captureReporterTaskTree } = req(
    next + '/dist/experimental/testing/reporting/live-tasks'
  )
  const { createTestReporter } = req(
    next + '/dist/experimental/testing/reporting/reporter'
  )
  const { serializeDiagnostic } = req(
    next + '/dist/experimental/testing/reporting/diagnostics'
  )
  const fixture = path.join(__dirname, 'fixtures/suite-hook-batches')
  let sessionsDisposed = 0
  const verified = []
  const trace = (directory) =>
    fs
      .readFileSync(path.join(directory, 'trace.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  function waitForFile(directory, name) {
    const filename = path.join(directory, name)
    if (fs.existsSync(filename)) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const observe = () => {
        if (fs.existsSync(filename)) {
          fs.unwatchFile(filename, observe)
          resolve()
        }
      }
      const observer = fs.watchFile(filename, { interval: 10 }, observe)
      observer.once('error', (error) => {
        fs.unwatchFile(filename, observe)
        reject(error)
      })
      observe()
    })
  }
  for (const config of [
    { name: 'fast' },
    ...[
      'getter',
      'sync-error',
      'sync-undefined',
      'sync-zero',
      'async-false',
      'noncallable-zero',
    ].map((failure) => ({ name: failure, failure })),
    { name: 'gated', gate: true },
    { name: 'forged-revision', forged: true },
  ])
    verified.push(await scenario(config))
  const facts = {
    scenarios: verified.length,
    physicalReporterSessions: verified.length,
    fastPackFinalState: true,
    stableTaskIdentity: true,
    sharedHookArgument: true,
    exactGetterDispatch: true,
    rawReporterErrors: true,
    concurrentBatches: true,
    finalJoin: true,
    forgedOwnerRejected: true,
    allSessionsDisposed: sessionsDisposed === verified.length,
  }
  fs.writeFileSync(
    path.join(output, 'VERIFIED.json'),
    JSON.stringify(
      { actualNode: process.version, rows: verified, ...facts },
      null,
      2
    ) + '\n'
  )
  console.log(JSON.stringify(facts))

  async function scenario(config) {
    const directory = path.join(output, config.name)
    fs.mkdirSync(directory)
    fs.cpSync(fixture, directory, { recursive: true })
    fs.writeFileSync(
      path.join(directory, 'config.json'),
      JSON.stringify(config)
    )
    fs.writeFileSync(path.join(directory, 'trace.jsonl'), '')
    process.env.NEXT_SUITE_HOOK_FIXTURE_ROOT = directory
    const session = await openCustomReporters({
      projectDir: directory,
      reporters: ['./reporter-a.mjs', './reporter-b.mjs'],
      write() {},
      writeError() {},
    })
    let updates, finishFailure
    try {
      assert.equal(session.captureSuiteEvents, true)
      assert.equal(session.captureHookEvents, true)
      assert.equal(session.captureCaseReady, true)
      assert.equal(session.captureModuleCollected, true)
      assert.equal(
        trace(directory).filter((row) => row.event === 'get').length,
        0,
        'Capability discovery cannot read callback getters'
      )
      const profile = {
        id: 'node',
        mode: 'development',
        environment: 'node',
        runtime: 'nodejs',
        bundler: 'turbopack',
      }
      const entry = {
        id: 'actual-suite-hook-' + config.name,
        file: path.join(directory, 'actual.test.mjs'),
        projectName: 'suite-hook',
        profile,
      }
      const runId = 'suite-hook-' + config.name
      const revision = 'actual-collected-' + config.name
      await session.beginRun([
        {
          entryId: entry.id,
          moduleId: entry.file,
          projectId: profile.id,
          projectName: entry.projectName,
          root: directory,
          pool: 'forks',
        },
      ])
      session.onModuleQueued(entry)
      const reporter = createTestReporter({ projectDir: directory, write() {} })
      const events = []
      const packets = []
      const completion = () => ({
        ...reporter.getResults(),
        events: [...events],
        status: 'passed',
      })
      function event(payload) {
        const value = {
          version: 1,
          runId,
          timestamp: Date.now(),
          revision,
          ...payload,
        }
        events.push(value)
        reporter.onEvent(value)
        session.onEvent(
          value,
          value.type === 'file-end' ? completion() : undefined
        )
      }
      event({ type: 'run-start' })
      event({ type: 'file-start', entry })
      let forged = false
      updates = createReporterTaskUpdates({
        captureCaseReady: true,
        captureSuiteEvents: true,
        captureHookEvents: true,
        onUpdate(packet) {
          packets.push(packet)
          const changeRevision =
            config.forged && !forged && packet.taskEvents?.length
          if (changeRevision) forged = true
          event({
            type: 'task-update',
            entryId: entry.id,
            ...packet,
            ...(changeRevision ? { revision: 'forged-revision' } : {}),
          })
        },
      })
      const collector = createCollector(entry.id)
      collector.api.describe('outer', () => {
        collector.api.beforeAll(({}, suite) => {
          suite.meta.suitePhase = 'beforeAll'
        })
        collector.api.beforeEach((context) => {
          context.task.meta.casePhase = 'beforeEach'
        })
        collector.api.afterEach((context) => {
          context.task.meta.casePhase = 'afterEach'
        })
        collector.api.afterAll(({}, suite) => {
          suite.meta.suitePhase = 'afterAll'
        })
        collector.api.test('actual passing case', async (context) => {
          context.task.meta.casePhase = 'body'
          if (config.gate) {
            await waitForFile(directory, 'ready-enter')
            fs.appendFileSync(
              path.join(directory, 'trace.jsonl'),
              JSON.stringify({ event: 'body-after-ready' }) + '\n'
            )
          }
        })
      })
      await collector.settle()
      const running = runCollected(
        collector.close(),
        {
          runId,
          signal: new AbortController().signal,
          filePath: entry.file,
          projectName: entry.projectName,
          projectDir: directory,
          testTimeout: 10000,
          hookTimeout: 10000,
          onCollected(file) {
            event({
              type: 'file-collected',
              entryId: entry.id,
              taskTree: captureReporterTaskTree(file),
            })
            updates.collected(file)
          },
          onSuiteReady(task) {
            updates.suiteReady(task)
          },
          onReporterHookOccurrence(task, hook, occurrence) {
            updates.hookOccurrence(task, hook, occurrence)
          },
          onCaseReady(task) {
            updates.caseReady(task)
          },
          onCaseStart(context) {
            updates.caseStart(context.testId)
          },
          onCaseEnd(value) {
            event({
              type: 'case-end',
              ...value,
              errors: value.errors.map((failure) =>
                serializeDiagnostic(failure.error, { phase: failure.phase })
              ),
            })
          },
          onCaseResult(task, value) {
            updates.caseResult(task, {
              ...value,
              errors: value.errors.map((failure) =>
                serializeDiagnostic(failure.error, { phase: failure.phase })
              ),
            })
          },
          onSuiteEnd(value, task) {
            event({
              type: 'suite-end',
              ...value,
              errors: value.errors.map((failure) =>
                serializeDiagnostic(failure.error, { phase: failure.phase })
              ),
            })
            updates.suiteEnd(task)
          },
        },
        () => {}
      )
      if (config.gate) {
        await waitForFile(directory, 'case-result-enter')
        assert.equal(
          fs.existsSync(path.join(directory, 'ready-done')),
          false,
          'A later batch runs while the first callback still awaits'
        )
        assert(
          trace(directory).some((row) => row.event === 'body-after-ready'),
          'The actual body continues while the reporter callback awaits'
        )
        let joined = false
        const joining = session.collectErrors().then((value) => {
          joined = true
          return value
        })
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(
          joined,
          false,
          'Final error collection joins pending batches'
        )
        fs.writeFileSync(path.join(directory, 'release-ready'), '')
        assert.deepEqual(await joining, [])
      }
      const result = await running
      await updates.finish()
      assert.equal(result.interrupted, false)
      assert.deepEqual(
        result.cases.map((value) => value.status),
        ['passed']
      )
      assert.deepEqual(result.errors, [])
      if (config.forged) {
        await assert.rejects(session.drainConsole(), /actual one-shot owner/)
        return {
          name: config.name,
          forgedOwnerRejected: true,
          passingTaskHeld: true,
        }
      }
      await session.drainConsole()
      const errors = await session.collectErrors()
      assert.equal(errors.length, config.failure ? 1 : 0)
      event({
        type: 'file-end',
        entryId: entry.id,
        status: 'passed',
        durationMs: 1,
      })
      await session.drainConsole()
      try {
        await session.finish(completion())
      } catch (error) {
        finishFailure = error
      }
      assert.equal(Boolean(finishFailure), Boolean(config.failure))
      const rows = trace(directory)
      const firstCallbacks = rows.filter(
        (row) => row.event === 'callback' && row.index === 0
      )
      for (const row of rows.filter((row) => row.event === 'callback')) {
        assert.equal(row.argc, 1)
        assert.equal(row.receiver, true)
      }
      assert.equal(
        firstCallbacks.filter((row) => row.name === 'onTestSuiteReady').length,
        1
      )
      assert.equal(
        firstCallbacks.filter((row) => row.name === 'onTestSuiteResult').length,
        1
      )
      const runEnd = rows.find(
        (row) => row.event === 'run-end' && row.index === 0
      )
      assert.equal(runEnd.reason, 'passed')
      if (config.failure) {
        assert.equal(runEnd.errors.length, 1)
        assert.equal(runEnd.errors[0].type, 'Unhandled Reporter Error')
        if (config.failure === 'sync-undefined')
          assert.equal(runEnd.errors[0].messageType, 'undefined')
        if (config.failure === 'sync-zero') {
          assert.equal(runEnd.errors[0].message, 0)
          assert.equal(runEnd.errors[0].messageType, 'number')
        }
        if (config.failure === 'async-false') {
          assert.equal(runEnd.errors[0].message, false)
          assert.equal(runEnd.errors[0].messageType, 'boolean')
        }
        const firstStart = rows.findIndex(
          (row) =>
            row.event === 'get' && row.index === 0 && row.name === 'onHookStart'
        )
        const nextFirstStart = rows.findIndex(
          (row, index) =>
            index > firstStart &&
            row.event === 'get' &&
            row.index === 0 &&
            row.name === 'onHookStart'
        )
        const firstGroup = rows.slice(firstStart, nextFirstStart)
        assert.equal(
          firstGroup.some(
            (row) =>
              row.event === 'get' &&
              row.index === 1 &&
              row.name === 'onHookStart'
          ),
          config.failure === 'async-false',
          'A synchronous failure aborts the current map; a rejection preserves fan-out'
        )
      } else assert.deepEqual(runEnd.errors, [])
      if (config.name === 'fast') {
        assert(
          packets.some(
            (packet) =>
              packet.taskEvents?.some((item) => item.event === 'case-ready') &&
              packet.taskEvents.some((item) => item.event === 'case-result')
          ),
          'Fast Ready and Result retain their actual shared final pack'
        )
        assert.deepEqual(
          firstCallbacks.map((row) => row.name),
          [
            'onTestSuiteReady',
            'onHookStart',
            'onHookEnd',
            'onTestCaseReady',
            'onHookStart',
            'onHookEnd',
            'onHookStart',
            'onHookEnd',
            'onTestCaseResult',
            'onHookStart',
            'onHookEnd',
            'onTestSuiteResult',
          ]
        )
        const ready = firstCallbacks.find(
          (row) => row.name === 'onTestCaseReady'
        )
        assert.equal(ready.state, 'passed')
        assert.equal(ready.meta.casePhase, 'afterEach')
        assert.equal(
          firstCallbacks.find((row) => row.name === 'onTestSuiteReady').meta
            .suitePhase,
          'afterAll'
        )
      }
      return {
        name: config.name,
        passingTaskHeld: true,
        callbackRows: firstCallbacks.length,
        reporterErrors: errors.length,
        packetCount: packets.length,
      }
    } finally {
      updates?.dispose()
      await session.dispose(
        finishFailure ? { handledFailure: finishFailure } : undefined
      )
      sessionsDisposed++
      assert.equal(
        trace(directory).filter((row) => row.event === 'closed').length,
        2
      )
      delete process.env.NEXT_SUITE_HOOK_FIXTURE_ROOT
    }
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
