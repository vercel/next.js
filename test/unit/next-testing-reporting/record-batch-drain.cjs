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
      'actual annotation RPC after pending reporter batches'
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
  const rows = []
  let disposed = 0
  for (const boundary of ['SuiteReady', 'CaseReady'])
    rows.push(await scenario(boundary))
  const facts = {
    scenarios: rows.length,
    physicalReporterSessions: rows.length,
    actualContextAnnotations: 2,
    pendingSuiteReadyDrained: true,
    pendingCaseReadyDrained: true,
    annotationReporterWaited: true,
    annotationBodyContinuationWaited: true,
    ordinaryBodyAndLaterBatchProgressed: true,
    passingTasks: 4,
    allSessionsDisposed: disposed === rows.length,
  }
  fs.writeFileSync(
    path.join(output, 'VERIFIED.json'),
    JSON.stringify({ actualNode: process.version, rows, ...facts }, null, 2) +
      '\n'
  )
  console.log(JSON.stringify(facts))

  function waitForFile(directory, name) {
    const filename = path.join(directory, name)
    if (fs.existsSync(filename)) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const observe = () => {
        if (!fs.existsSync(filename)) return
        fs.unwatchFile(filename, observe)
        resolve()
      }
      const watcher = fs.watchFile(filename, { interval: 10 }, observe)
      watcher.once('error', (error) => {
        fs.unwatchFile(filename, observe)
        reject(error)
      })
      observe()
    })
  }

  async function scenario(boundary) {
    const directory = path.join(output, boundary)
    fs.mkdirSync(directory)
    fs.copyFileSync(
      path.join(__dirname, 'fixtures/record-batch-drain/reporter.mjs'),
      path.join(directory, 'reporter.mjs')
    )
    fs.writeFileSync(
      path.join(directory, 'config.json'),
      JSON.stringify({ boundary })
    )
    fs.writeFileSync(path.join(directory, 'trace.jsonl'), '')
    process.env.NEXT_RECORD_BATCH_DRAIN_ROOT = directory
    const mark = (name) => fs.writeFileSync(path.join(directory, name), '')
    const trace = () =>
      fs
        .readFileSync(path.join(directory, 'trace.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    const emitBody = (event) =>
      fs.appendFileSync(
        path.join(directory, 'trace.jsonl'),
        JSON.stringify({ event }) + '\n'
      )
    const session = await openCustomReporters({
      projectDir: directory,
      reporters: ['./reporter.mjs'],
      write() {},
      writeError() {},
    })
    let updates, running
    try {
      assert.equal(session.captureTestRecords, true)
      assert.equal(session.captureSuiteEvents, true)
      assert.equal(session.captureCaseReady, true)
      const profile = {
        id: 'node',
        mode: 'development',
        environment: 'node',
        runtime: 'nodejs',
        bundler: 'turbopack',
      }
      const entry = {
        id: 'record-batch-' + boundary,
        file: path.join(directory, 'actual.test.mjs'),
        projectName: 'record-batch',
        profile,
      }
      const runId = 'causal-record-batch-' + boundary
      const revision = 'retained-record-batch-' + boundary
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
      const records = []
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
      updates = createReporterTaskUpdates({
        captureCaseReady: true,
        captureSuiteEvents: true,
        onUpdate(packet) {
          packets.push(packet)
          event({ type: 'task-update', entryId: entry.id, ...packet })
        },
      })
      const collector = createCollector(entry.id)
      collector.api.describe('outer', { concurrent: true }, () => {
        collector.api.beforeAll(({}, suite) => {
          suite.meta.owned = boundary
        })
        collector.api.test('annotating body', async (context) => {
          await waitForFile(directory, 'batch-enter')
          context.task.meta.phase = 'record-pending'
          emitBody('annotation-body-before-record')
          const annotation = await context.annotate('actual causal annotation')
          assert.equal(annotation.message, 'actual causal annotation')
          assert.equal(context.task.annotations.at(-1), annotation)
          emitBody('annotation-body-after-record')
          mark('annotation-body-after-record')
        })
        collector.api.test('ordinary body', async (context) => {
          await waitForFile(directory, 'record-request')
          assert.equal(
            fs.existsSync(path.join(directory, 'release-batch')),
            false
          )
          context.task.meta.phase = 'ordinary-passed'
          emitBody('ordinary-body-done')
          mark('ordinary-body-done')
        })
      })
      await collector.settle()
      const projectCaseResult = (value) => ({
        ...value,
        errors: value.errors.map((failure) =>
          serializeDiagnostic(failure.error, { phase: failure.phase })
        ),
      })
      running = runCollected(
        collector.close(),
        {
          runId,
          signal: new AbortController().signal,
          filePath: entry.file,
          projectName: entry.projectName,
          projectDir: directory,
          captureTestRecords: true,
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
          onCaseReady(task) {
            updates.caseReady(task)
          },
          onCaseStart(context) {
            updates.caseStart(context.testId)
          },
          onCaseEnd(value) {
            event({ type: 'case-end', ...projectCaseResult(value) })
          },
          onCaseResult(task, value) {
            updates.caseResult(task, projectCaseResult(value))
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
          async onAnnotation(context, annotation) {
            // Preserve the real worker's existing producer-send barrier. The
            // controller must also join the corresponding callback batch replies.
            await updates.finish()
            const record = {
              version: 1,
              timestamp: Date.now(),
              runId,
              entryId: entry.id,
              revision,
              caseId: context.testId,
              attempt: {
                id: context.id,
                retry: context.retry,
                repeat: context.repeat,
              },
              type: 'test-annotation',
              annotation,
            }
            records.push(record)
            emitBody('record-request')
            mark('record-request')
            const value = await session.onTestRecord(record)
            return value.annotation
          },
        },
        () => {}
      )
      await waitForFile(directory, 'record-request')
      await waitForFile(directory, 'ordinary-result')
      assert.equal(records.length, 1)
      assert.equal(
        fs.existsSync(path.join(directory, 'ordinary-body-done')),
        true
      )
      assert.equal(fs.existsSync(path.join(directory, 'batch-released')), false)
      assert.equal(
        fs.existsSync(path.join(directory, 'annotation-enter')),
        false,
        'An actual record RPC cannot enter its reporter before the pending same-entry batch completes'
      )
      assert.equal(
        fs.existsSync(path.join(directory, 'annotation-body-after-record')),
        false,
        'The actual context.annotate continuation stays pending until the task batch completes'
      )
      mark('release-batch')
      const result = await running
      await updates.finish()
      assert.deepEqual(
        result.cases.map((test) => test.status),
        ['passed', 'passed']
      )
      assert.deepEqual(result.errors, [])
      assert.equal(result.interrupted, false)
      await session.drainConsole()
      assert.deepEqual(await session.collectErrors(), [])
      assert.equal(
        fs.existsSync(path.join(directory, 'annotation-enter')),
        true
      )
      assert.equal(
        fs.existsSync(path.join(directory, 'annotation-body-after-record')),
        true
      )
      event({
        type: 'file-end',
        entryId: entry.id,
        status: 'passed',
        durationMs: 1,
      })
      await session.drainConsole()
      await session.finish(completion())
      const observed = trace()
      const position = (name) => observed.findIndex((row) => row.event === name)
      assert(position('ordinary-body-done') < position('batch-released'))
      assert(position('batch-released') < position('annotation-enter'))
      assert(
        position('annotation-enter') < position('annotation-body-after-record')
      )
      assert.equal(
        observed.filter((row) => row.event === 'annotation-enter').length,
        1
      )
      fs.writeFileSync(
        path.join(directory, 'PACKETS.json'),
        JSON.stringify(packets, null, 2) + '\n'
      )
      fs.writeFileSync(
        path.join(directory, 'TRACE.json'),
        JSON.stringify(observed, null, 2) + '\n'
      )
      return {
        boundary,
        passingTasks: result.cases.length,
        annotations: records.length,
        ordinaryBodyProgressedBeforeRelease: true,
        annotationWaitedForBatch: true,
      }
    } finally {
      // Release the owned reporter even when a negative control fails early.
      mark('release-batch')
      if (running) await running.catch(() => {})
      if (updates) await updates.finish().catch(() => {})
      updates?.dispose()
      await session.dispose()
      disposed++
      assert.equal(trace().filter((row) => row.event === 'closed').length, 1)
      delete process.env.NEXT_RECORD_BATCH_DRAIN_ROOT
    }
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
