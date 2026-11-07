const { resolveFixturePath } = require('../../lib/next-testing-fixtures.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const { fork } = require('node:child_process')
const { createHash } = require('node:crypto')
const driver = process.argv[2] === '--driver'
const producer = process.argv[2] === '--producer'
const [project, output, only, captureMode, attachmentsDir] = process.argv.slice(
  driver || producer ? 3 : 2
)
assert(project && output)

async function main() {
  fs.mkdirSync(output, { recursive: true })
  if (producer) {
    await require('./test-records-producer.cjs')({
      project,
      dir: output,
      name: only,
      capture: captureMode === 'capture',
      attachmentsDir: attachmentsDir || undefined,
    })
    return
  }
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
      [__filename, '--driver', project, output, ...(only ? [only] : [])],
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
      'actual annotation and artifact reporter sessions'
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
  if (only === 'ready-dispatch-order') {
    await verifyReadyDispatchOrder({ project, output })
    return
  }
  if (only === 'dormant-observer-admission') {
    await verifyDormantObserverAdmission({ project, output })
    return
  }
  const fixture = path.join(__dirname, 'fixtures/test-record-reporters')
  const profiles = [
    'basic',
    'async',
    'mutate',
    'dormant',
    'internal-only',
    'getter-undefined',
    'getter-throw-annotation',
    'async-reject-artifact',
    'caught-errors',
    'unawaited-annotation',
    'unawaited-artifact',
    'multi-getter-throw',
    'multi-sync-throw',
    'multi-async-reject',
    'attachment',
    'concurrent-three',
    'primitive-sync-undefined',
    'primitive-sync-null',
    'primitive-sync-false',
    'primitive-sync-zero',
    'primitive-sync-empty',
    'primitive-async-undefined',
    'primitive-async-null',
    'primitive-async-false',
    'primitive-async-zero',
    'primitive-async-empty',
    'concurrent-out-of-order',
    'truthy-text',
    'truthy-number',
    'truthy-object',
    'truthy-array',
    'truthy-aggregate',
  ]
  const selected = (
    only ? profiles.filter((name) => only.split(',').includes(name)) : profiles
  ).map((name) => ({ profile: { name, multi: name.startsWith('multi-') } }))
  assert(selected.length || only === 'local-attachment')
  const verified = []
  for (const profile of selected) verified.push(await scenario(profile))
  if (!only || only.split(',').includes('local-attachment'))
    verified.push(await localAttachment())
  const facts = {
    scenarios: verified.length,
    actualCallbacks: verified.reduce((n, x) => n + x.actualCallbacks, 0),
    actualGetterReads: verified.reduce((n, x) => n + x.actualGetterReads, 0),
    checkedCallbackRows: verified.reduce(
      (n, x) => n + x.checkedCallbackRows,
      0
    ),
    globalReporterErrors: 0,
    allSessionsDisposed: true,
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

  async function localAttachment() {
    const dir = path.join(output, 'local-attachment')
    fs.mkdirSync(dir)
    const input = path.join(dir, 'input.txt'),
      bytes = 'owned attachment bytes\n'
    fs.writeFileSync(input, bytes)
    const retained = path.join(dir, 'retained')
    const hash = createHash('sha1').update(input).digest('hex')
    const annotationPath = path.join(retained, 'local-note-' + hash + '.txt')
    const artifactPath = path.join(retained, hash + '.txt')
    {
      const localModel = {
        profile: { name: 'local-attachment', multi: false },
        functionalOnly: true,
      }
      const legacy = await scenario(localModel, {
        capture: false,
        dir,
        attachmentsDir: retained,
        prefix: 'legacy-',
      })
      assert.equal(
        legacy.copyCalls,
        2,
        'legacy attachment normalization copies each actual source once'
      )
      const captured = await scenario(localModel, {
        capture: true,
        dir,
        attachmentsDir: retained,
        prefix: 'captured-',
      })
      assert.equal(
        captured.copyCalls,
        2,
        'capture normalizes each source once; consumer does not normalize retained paths again'
      )
      for (const run of [legacy, captured]) {
        assert.equal(
          run.continuation.annotation.attachment.path,
          annotationPath
        )
        assert.equal(
          run.continuation.artifact.attachments[0].path,
          artifactPath
        )
      }
      assert.deepEqual(captured.continuation, legacy.continuation)
      for (const row of captured.rows.filter(
        (row) => row.event === 'callback-enter'
      )) {
        assert.equal(row.argc, 2)
        assert.equal(row.receiver, true)
        assert.equal(row.sameArrayValue, true)
        const attachment =
          row.name === 'onTestCaseAnnotate'
            ? row.value.attachment
            : row.value.attachments[0]
        assert.equal(fs.readFileSync(attachment.path, 'utf8'), bytes)
      }
      assert.deepEqual(
        fs.readdirSync(retained).sort(),
        [path.basename(annotationPath), path.basename(artifactPath)].sort()
      )
      return {
        name: 'local-attachment',
        actualCallbacks: 2,
        actualGetterReads: 2,
        checkedCallbackRows: 0,
        legacyCopies: 2,
        capturedCopies: 2,
        retainedFiles: 2,
        sessionDisposed: true,
        noAdditionalReferenceClaim: true,
      }
    }
  }

  async function scenario(expected, settings = {}) {
    const name = expected.profile.name
    const capture = settings.capture !== false
    const dir = settings.dir || path.join(output, name)
    fs.mkdirSync(dir, { recursive: true })
    const trace = path.join(dir, (settings.prefix || '') + 'trace.jsonl')
    const source = path.join(fixture, 'sources', name)
    const file = path.join(dir, 'contract.test.mjs')
    const body = fs.readFileSync(
      resolveFixturePath(path.join(source, 'contract.test.mjs.txt')),
      'utf8'
    )
    fs.writeFileSync(file, body)
    fs.copyFileSync(
      resolveFixturePath(path.join(source, 'reporter.mjs.txt')),
      path.join(dir, 'reporter.mjs')
    )
    const reporters = [path.join(dir, 'reporter.mjs')]
    if (expected.profile.multi) {
      fs.copyFileSync(
        resolveFixturePath(path.join(source, 'second-reporter.mjs.txt')),
        path.join(dir, 'second-reporter.mjs')
      )
      reporters.push(path.join(dir, 'second-reporter.mjs'))
    }
    fs.writeFileSync(trace, '')
    process.env.AA_TRACE = trace
    process.env.AA_WORKER = path.join(dir, 'body-worker.json')
    const session = capture
      ? await openCustomReporters({
          projectDir: dir,
          reporters,
          write() {},
          writeError() {},
        })
      : undefined
    if (session) assert.equal(session.captureTestRecords, true)
    const operations = new Set()
    const child = fork(
      __filename,
      [
        '--producer',
        project,
        dir,
        name,
        capture ? 'capture' : 'legacy',
        settings.attachmentsDir || '',
      ],
      {
        cwd: project,
        execPath: process.execPath,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        serialization: 'advanced',
        env: {
          ...process.env,
          CI: '1',
          NEXT_TELEMETRY_DISABLED: '1',
          AA_TRACE: trace,
          AA_WORKER: path.join(dir, 'body-worker.json'),
        },
      }
    )
    let stdout = '',
      stderr = '',
      result,
      initialTree,
      copyCalls,
      relayFailure
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    const send = (value) =>
      new Promise((resolve, reject) =>
        child.send(value, (error) => (error ? reject(error) : resolve()))
      )
    child.on('message', (message) => {
      if (message.type === 'event') {
        if (message.event.type === 'file-collected')
          initialTree = message.event.taskTree
        try {
          session?.onEvent(message.event)
        } catch (error) {
          relayFailure ||= error
        }
        return
      }
      if (message.type === 'producer-result') {
        result = message.result
        initialTree = message.initialTree
        copyCalls = message.copyCalls
        return
      }
      if (message.type === 'producer-error') {
        relayFailure ||= message.error
        return
      }
      if (message.type !== 'test-record') {
        relayFailure ||= new Error('Unknown actual producer IPC message')
        return
      }
      const operation = (async () => {
        let outcome
        try {
          const value = await session.onTestRecord(message.event)
          outcome = { kind: 'return', value }
        } catch (error) {
          outcome = { kind: 'throw', error }
        }
        await send({
          type: 'test-recorded',
          requestId: message.requestId,
          runId: message.event.runId,
          entryId: message.event.entryId,
          revision: message.event.revision,
          outcome,
        })
      })()
      operations.add(operation)
      void operation.then(
        () => operations.delete(operation),
        (error) => {
          operations.delete(operation)
          relayFailure ||= error
        }
      )
    })
    const exited = new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve({ code, signal }))
    })
    let exit, reporterErrors
    try {
      exit = await exited
      if (operations.size) await Promise.allSettled([...operations])
      if (relayFailure) throw relayFailure
      assert.equal(exit.code, 0, stderr)
      assert.equal(exit.signal, null)
      assert(
        result && initialTree,
        'Actual producer must report its completed result and collected task tree'
      )
      await session?.drainConsole()
      reporterErrors = session ? await session.collectErrors() : []
    } finally {
      if (child.connected) child.disconnect()
      await session?.dispose()
      fs.writeFileSync(
        path.join(dir, (settings.prefix || '') + 'PRODUCER-CLOSED.json'),
        JSON.stringify(
          {
            actualNode: process.version,
            pid: child.pid,
            exit,
            stdout,
            stderr,
            copyCalls,
            relayFailure,
            failureMessage: relayFailure?.message,
            failureStack: relayFailure?.stack,
            joined: true,
          },
          null,
          2
        ) + '\n'
      )
    }
    assert.deepEqual(
      reporterErrors,
      [],
      'caught record callbacks must not become global reporter errors'
    )
    const rows = fs
      .readFileSync(trace, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((value) => JSON.parse(value))
    fs.writeFileSync(
      path.join(dir, (settings.prefix || '') + 'trace.json'),
      JSON.stringify(rows, null, 2) + '\n'
    )
    if (expected.functionalOnly) {
      assert(result.cases.every((value) => value.status === 'passed'))
      assert.equal(result.interrupted, false)
      const continuation = rows.find((row) => row.event === 'local-after')
      assert(continuation)
      assert.equal(
        rows.filter((row) => row.event === 'close').length,
        capture ? 1 : 0
      )
      return {
        name,
        actualCallbacks: rows.filter((row) => row.event === 'callback-enter')
          .length,
        actualGetterReads: rows.filter((row) => row.event === 'getter').length,
        checkedCallbackRows: 0,
        sessionDisposed: true,
        continuation,
        rows,
        copyCalls,
      }
    }
    assertRecordBehavior(name, rows, result, expected.profile.multi)
    const callbacks = (value) =>
      value.filter((item) =>
        [
          'getter',
          'callback-enter',
          'callback-exit',
          'async-prefix',
          'gate-enter',
          'gate-release',
        ].includes(item.event)
      )
    return {
      name,
      actualCallbacks: rows.filter((item) => item.event === 'callback-enter')
        .length,
      actualGetterReads: rows.filter((item) => item.event === 'getter').length,
      checkedCallbackRows: callbacks(rows).length,
      cases: result.cases.map((value) => value.status),
      sessionDisposed: true,
    }
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

/** Real logical preparation and its recorded occurrence use the same dispatch contract. */
async function verifyReadyDispatchOrder({ project, output }) {
  const req = createRequire(path.join(project, 'package.json'))
  const next = path.dirname(req.resolve('next/package.json'))
  const { createCustomReporterRuntime } = req(
    next + '/dist/experimental/testing/reporting/custom-reporter-runtime'
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
  const verified = []
  const mismatches = []
  for (const delivery of ['live', 'replay']) {
    for (const failure of ['getter', 'synchronous', 'asynchronous']) {
      const dir = path.join(output, delivery + '-' + failure)
      fs.mkdirSync(dir)
      const identity =
        'ready-order-' + process.pid + '-' + delivery + '-' + failure
      const state = (globalThis[identity] = {
        rows: [],
        reads: [0, 0],
        tests: [],
      })
      const reporters = [0, 1].map((index) => {
        const filename = path.join(dir, 'reporter-' + index + '.mjs')
        fs.writeFileSync(
          filename,
          `const state=globalThis[${JSON.stringify(identity)}];
export default class Reporter {
 get onTestCaseReady() {
  state.reads[${index}]++;
  state.rows.push(['getter',${index}]);
  if (${index}===0 && ${JSON.stringify(failure)}==='getter') throw new Error('ready getter');
  return ${failure === 'asynchronous' && index === 0 ? 'async ' : ''}function(test) {
   state.rows.push(['ready',${index},this instanceof Reporter,test.id]);
   state.tests[${index}]=test;
   if (${index}===0) throw new Error('ready callback');
  };
 }
 onTestCaseResult(test) {state.rows.push(['result',${index},this instanceof Reporter,test.id]);state.resultTest=test;}
}`
        )
        return filename
      })
      const messages = []
      let response
      let closed = 0
      const runtime = createCustomReporterRuntime({
        async send(message) {
          messages.push(message)
          if (response) {
            const resolve = response
            response = undefined
            resolve(message)
          }
        },
        closeTransport() {
          closed++
        },
      })
      async function request(message) {
        assert.equal(
          response,
          undefined,
          'one actual runtime request at a time'
        )
        const reply = new Promise((resolve) => {
          response = resolve
        })
        runtime.receive(message)
        return reply
      }
      let updates
      try {
        const initialized = await request({
          type: 'run',
          input: { projectDir: dir, queuedProjectRoot: dir, files: reporters },
        })
        assert.equal(initialized.type, 'custom-reporter-result')
        assert.equal(initialized.captureCaseReady, true)
        assert.deepEqual(
          state.reads,
          [0, 0],
          'planning never invokes Ready getters'
        )
        let initialTree, actualFile
        const packets = []
        updates = createReporterTaskUpdates({
          captureCaseReady: true,
          onUpdate(value) {
            packets.push(value)
          },
        })
        const collector = createCollector(identity)
        collector.api.test('actual prepared logical case', () => {})
        const result = await runCollected(
          collector.close(),
          {
            runId: identity,
            signal: new AbortController().signal,
            filePath: path.join(dir, 'actual.test.mjs'),
            onCollected(file) {
              actualFile = file
              initialTree = captureReporterTaskTree(file)
              updates.collected(file)
            },
            onCaseReady(test) {
              updates.caseReady(test)
            },
            onCaseStart(context) {
              updates.caseStart(context.testId)
            },
            onCaseResult(test, value) {
              updates.caseResult(test, value)
            },
            onSuiteEnd(_value, suite) {
              updates.suiteEnd(suite)
            },
          },
          () => {}
        )
        await updates.finish()
        assert.deepEqual(
          result.cases.map((value) => value.status),
          ['passed']
        )
        const occurrences = packets.flatMap((packet) => packet.caseEvents || [])
        const actualCaseId = initialTree.tasks[0].id
        assert.deepEqual(occurrences, [
          { event: 'ready', caseId: actualCaseId },
          { event: 'result', caseId: actualCaseId },
        ])
        if (delivery === 'live') {
          runtime.receive({ type: 'task-state', taskTree: initialTree })
          for (const packet of packets) {
            runtime.receive({
              type: 'task-state',
              taskTree: packet.taskTree,
              taskUpdateIds: packet.taskUpdateIds,
            })
            for (const occurrence of packet.caseEvents || []) {
              const reply = await request({
                type: 'case-' + occurrence.event,
                entryId: initialTree.id,
                caseId: occurrence.caseId,
              })
              assert.equal(
                reply.type,
                'custom-reporter-result',
                JSON.stringify(reply)
              )
            }
          }
        } else {
          const terminal = captureReporterTaskTree(actualFile)
          const reply = await request({
            type: 'replay-file',
            taskTree: terminal,
            caseEvents: occurrences,
            completion: {
              files: [
                { entryId: actualFile.id, status: result.cases[0].status },
              ],
              suites: [],
              entries: [],
              events: [],
              cases: result.cases,
              status: result.cases[0].status,
            },
          })
          assert.equal(
            reply.type,
            'custom-reporter-result',
            JSON.stringify(reply)
          )
        }
        let matches = true
        try {
          const expectedSecond = failure === 'asynchronous' ? 1 : 0
          assert.deepEqual(
            state.reads,
            [1, expectedSecond],
            'synchronous Ready failure stops later getters; rejection does not'
          )
          const readyRows = state.rows.filter((row) => row[0] === 'ready')
          assert.equal(
            readyRows.length,
            failure === 'getter' ? 0 : 1 + expectedSecond
          )
          for (const row of readyRows) {
            assert.equal(row[2], true)
            assert.equal(row[3], actualCaseId)
          }
          const resultRows = state.rows.filter((row) => row[0] === 'result')
          assert.deepEqual(
            resultRows.map((row) => [row[1], row[2], row[3]]),
            [
              [0, true, actualCaseId],
              [1, true, actualCaseId],
            ],
            'Result fan-out retains existing dispatch'
          )
          for (const test of state.tests)
            if (test)
              assert.equal(
                test,
                state.resultTest,
                'Ready and Result retain the actual logical TestCase'
              )
          const errors = await request({ type: 'reporter-errors' })
          assert.equal(errors.reporterErrors.length, 1)
        } catch (error) {
          matches = false
          mismatches.push({ delivery, failure, message: error.message })
        }
        verified.push({
          delivery,
          failure,
          matches,
          reads: state.reads,
          rows: state.rows,
        })
      } finally {
        updates?.dispose()
        const shutdown = await request({ type: 'shutdown' })
        assert.equal(shutdown.type, 'custom-reporter-result')
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(closed, 1)
        delete globalThis[identity]
      }
    }
  }
  fs.writeFileSync(
    path.join(output, 'READY-DISPATCH-ROWS.json'),
    JSON.stringify(verified, null, 2) + '\n'
  )
  fs.writeFileSync(
    path.join(output, 'MISMATCHES.json'),
    JSON.stringify(mismatches, null, 2) + '\n'
  )
  if (mismatches.length)
    throw new AggregateError(
      mismatches.map(
        (value) =>
          new Error(value.delivery + '/' + value.failure + ': ' + value.message)
      ),
      'Ready dispatch order mismatches'
    )
  const facts = {
    scenarios: 6,
    live: 3,
    replay: 3,
    synchronousStops: 4,
    asynchronousContinues: 2,
    identityPreserved: true,
    singleGetterRead: true,
    sessionsDisposed: 6,
  }
  fs.writeFileSync(
    path.join(output, 'VERIFIED.json'),
    JSON.stringify(facts, null, 2) + '\n'
  )
  console.log(JSON.stringify(facts))
}

/** Dormant declarations do not imply that their actual callback domain exists. */
async function verifyDormantObserverAdmission({ project, output }) {
  const req = createRequire(path.join(project, 'package.json'))
  const next = path.dirname(req.resolve('next/package.json'))
  const { createCustomReporterRuntime } = req(
    next + '/dist/experimental/testing/reporting/custom-reporter-runtime'
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
  const { selectReporterRunSpecifications } = req(
    next + '/dist/experimental/testing/reporting/custom-reporter-specifications'
  )
  const dormant = [
    'onBrowserInit',
    'onTestRemoved',
    'onWatcherStart',
    'onWatcherRerun',
    'onServerRestart',
    'onCoverage',
    'onTestCaseBenchmark',
  ]
  const key = 'dormant-observers-' + process.pid
  const state = (globalThis[key] = {
    reads: {},
    ready: 0,
    result: 0,
    coverageReads: 0,
    watchReads: 0,
    rows: [],
  })
  const profile = {
    id: key,
    mode: 'development',
    environment: 'node',
    runtime: 'nodejs',
    bundler: 'turbopack',
  }
  const entry = { id: key, file: path.join(output, 'actual.test.mjs'), profile }
  const planned = { profile, isolate: true, entries: [entry] }
  const specifications = selectReporterRunSpecifications(
    output,
    [planned],
    [entry.id]
  )
  const mismatches = []
  let sessionsDisposed = 0,
    unsupportedDomains = 0
  async function session(mode, source, body) {
    const dir = path.join(output, mode)
    fs.mkdirSync(dir)
    const filename = path.join(dir, 'reporter.mjs')
    fs.writeFileSync(filename, source)
    let response,
      closed = 0
    const runtime = createCustomReporterRuntime({
      async send(message) {
        if (response) {
          const resolve = response
          response = undefined
          resolve(message)
        }
      },
      closeTransport() {
        closed++
      },
    })
    async function request(message) {
      assert.equal(response, undefined)
      const reply = new Promise((resolve) => {
        response = resolve
      })
      runtime.receive(message)
      return reply
    }
    try {
      await body(runtime, request, filename, dir)
    } catch (error) {
      mismatches.push({ mode, message: error.message })
    } finally {
      const closedReply = await request({ type: 'shutdown' })
      assert.equal(closedReply.type, 'custom-reporter-result')
      await new Promise((resolve) => setImmediate(resolve))
      assert.equal(closed, 1)
      sessionsDisposed++
    }
  }
  try {
    await session(
      'ordinary',
      `const state=globalThis[${JSON.stringify(key)}];export default class Reporter {
constructor(){for(const name of ${JSON.stringify(dormant)})Object.defineProperty(this,name,{get(){state.reads[name]=(state.reads[name]||0)+1;throw new Error('Dormant getter read: '+name)}})}
onTestCaseReady(test){state.ready++;state.readyTest=test;state.rows.push(['ready',test.id,this instanceof Reporter])}
onTestCaseResult(test){state.result++;state.resultTest=test;state.rows.push(['result',test.id,this instanceof Reporter])}
}`,
      async (runtime, request, filename, dir) => {
        const initialized = await request({
          type: 'run',
          input: { projectDir: dir, queuedProjectRoot: dir, files: [filename] },
        })
        assert.equal(
          initialized.type,
          'custom-reporter-result',
          JSON.stringify(initialized)
        )
        assert.equal(
          initialized.captureRunStart,
          true,
          'Dormant domain declarations require the actual selected Node boundary'
        )
        assert.equal(initialized.captureCaseReady, true)
        assert.deepEqual(state.reads, {})
        const started = await request({
          type: 'run-start',
          specifications,
        })
        assert.equal(
          started.type,
          'custom-reporter-result',
          JSON.stringify(started)
        )
        let initialTree
        const packets = []
        const updates = createReporterTaskUpdates({
          captureCaseReady: true,
          onUpdate(value) {
            packets.push(value)
          },
        })
        try {
          const collector = createCollector(entry.id)
          collector.api.test('actual ordinary Node task', () => {})
          const result = await runCollected(
            collector.close(),
            {
              runId: key,
              signal: new AbortController().signal,
              filePath: entry.file,
              onCollected(file) {
                initialTree = captureReporterTaskTree(file)
                updates.collected(file)
              },
              onCaseReady(test) {
                updates.caseReady(test)
              },
              onCaseStart(context) {
                updates.caseStart(context.testId)
              },
              onCaseResult(test, value) {
                updates.caseResult(test, value)
              },
              onSuiteEnd(_value, suite) {
                updates.suiteEnd(suite)
              },
            },
            () => {}
          )
          await updates.finish()
          assert.deepEqual(
            result.cases.map((value) => value.status),
            ['passed']
          )
          runtime.receive({ type: 'task-state', taskTree: initialTree })
          for (const packet of packets) {
            runtime.receive({
              type: 'task-state',
              taskTree: packet.taskTree,
              taskUpdateIds: packet.taskUpdateIds,
            })
            for (const event of packet.caseEvents || []) {
              const reply = await request({
                type: 'case-' + event.event,
                entryId: initialTree.id,
                caseId: event.caseId,
              })
              assert.equal(
                reply.type,
                'custom-reporter-result',
                JSON.stringify(reply)
              )
            }
          }
          assert.equal(state.ready, 1)
          assert.equal(state.result, 1)
          assert.equal(state.readyTest, state.resultTest)
          assert.deepEqual(
            state.rows.map((row) => row[2]),
            [true, true]
          )
          assert.deepEqual(state.reads, {})
          const errors = await request({ type: 'reporter-errors' })
          assert.deepEqual(errors.reporterErrors, [])
        } finally {
          updates.dispose()
        }
      }
    )
    // The same actual selector used by machine.beginRun rejects Browser role
    // before a reporter runtime can receive any selected-specification request.
    assert.throws(
      () =>
        selectReporterRunSpecifications(
          output,
          [
            {
              ...planned,
              profile: {
                ...profile,
                environment: 'browser',
                browserClient: true,
              },
              entries: [
                {
                  ...entry,
                  profile: {
                    ...profile,
                    environment: 'browser',
                    browserClient: true,
                  },
                },
              ],
            },
          ],
          [entry.id]
        ),
      /one-shot isolated ordinary Node/
    )
    unsupportedDomains++
    await session(
      'watch',
      `const state=globalThis[${JSON.stringify(key)}];export default class Reporter {get onBrowserInit(){state.watchReads++;return function(){throw new Error('Browser callback must not run in watch')}}}`,
      async (_runtime, request, filename, dir) => {
        const initialized = await request({
          type: 'run',
          input: {
            projectDir: dir,
            queuedProjectRoot: dir,
            files: [filename],
            watch: true,
          },
        })
        assert.equal(initialized.type, 'custom-reporter-failed')
        assert.match(
          initialized.error.message,
          /requires actual Next producer events/
        )
        assert.equal(state.watchReads, 1)
        unsupportedDomains++
      }
    )
    await session(
      'coverage',
      `const state=globalThis[${JSON.stringify(key)}];export default class Reporter {get onCoverage(){state.coverageReads++;throw new Error('Coverage getter must stay unread until an implemented producer')}}`,
      async (_runtime, request, filename, dir) => {
        const initialized = await request({
          type: 'run',
          input: { projectDir: dir, queuedProjectRoot: dir, files: [filename] },
        })
        assert.equal(
          initialized.type,
          'custom-reporter-result',
          JSON.stringify(initialized)
        )
        assert.equal(initialized.captureRunStart, true)
        assert.equal(state.coverageReads, 0)
        const started = await request({
          type: 'run-start',
          specifications,
          coverage: true,
        })
        assert.equal(started.type, 'custom-reporter-failed')
        assert.match(started.error.message, /onCoverage.*actual coverage/)
        assert.equal(state.coverageReads, 0)
        unsupportedDomains++
      }
    )
    const facts = {
      dormantObservers: dormant.length,
      dormantGetterReads: Object.values(state.reads).reduce((a, b) => a + b, 0),
      activeReadyCallbacks: state.ready,
      activeResultCallbacks: state.result,
      unsupportedDomains,
      coverageGetterReads: state.coverageReads,
      identityPreserved:
        state.readyTest !== undefined && state.readyTest === state.resultTest,
      sessionsDisposed,
    }
    fs.writeFileSync(
      path.join(output, 'DORMANT-ROWS.json'),
      JSON.stringify(
        {
          facts,
          rows: state.rows,
          reads: state.reads,
          watchReads: state.watchReads,
          mismatches,
        },
        null,
        2
      ) + '\n'
    )
    if (mismatches.length)
      throw new AggregateError(
        mismatches.map((value) => new Error(value.mode + ': ' + value.message)),
        'Dormant observer admission mismatches'
      )
    assert.deepEqual(facts, {
      dormantObservers: 7,
      dormantGetterReads: 0,
      activeReadyCallbacks: 1,
      activeResultCallbacks: 1,
      unsupportedDomains: 3,
      coverageGetterReads: 0,
      identityPreserved: true,
      sessionsDisposed: 3,
    })
    fs.writeFileSync(
      path.join(output, 'VERIFIED.json'),
      JSON.stringify(facts, null, 2) + '\n'
    )
    console.log(JSON.stringify(facts))
  } finally {
    delete globalThis[key]
  }
}

function assertRecordBehavior(name, rows, result, multi) {
  const body = rows.filter((row) => row.source === 'body')
  const getters = rows.filter((row) => row.event === 'getter')
  const entered = rows.filter((row) => row.event === 'callback-enter')
  const exited = rows.filter((row) => row.event === 'callback-exit')
  const failed = ['getter-throw-annotation', 'async-reject-artifact'].includes(
    name
  )
  assert.deepEqual(
    result.cases.map((test) => [test.name, test.status]),
    [
      ['records', failed ? 'failed' : 'passed'],
      ['following', 'passed'],
    ]
  )
  assert.equal(result.interrupted, false)
  assert.equal(
    rows.filter((row) => row.event === 'close').length,
    multi ? 2 : 1
  )
  const counts =
    name === 'dormant' || name === 'internal-only'
      ? [0, 0]
      : name === 'getter-undefined'
        ? [2, 0]
        : name === 'getter-throw-annotation' || name === 'multi-getter-throw'
          ? [1, 0]
          : name === 'multi-sync-throw' ||
              name === 'async-reject-artifact' ||
              name.startsWith('unawaited-')
            ? [1, 1]
            : name.startsWith('concurrent-')
              ? [3, 3]
              : [2, 2]
  assert.deepEqual([getters.length, entered.length], counts)
  const beginning = body.find((row) => row.event === 'begin')
  assert(beginning)
  assert.deepEqual(beginning.values, {
    annotations: [],
    artifacts: [],
    meta: { user: 'authored' },
  })
  const following = body.find((row) => row.event === 'following')
  assert(following)
  assert.deepEqual(following.values, {
    annotations: [],
    artifacts: [],
    meta: {},
  })
  for (const getter of getters) {
    assert.equal(getter.receiver, true)
    assert(
      rows.indexOf(getter) > rows.indexOf(beginning),
      'Record getters stay lazy until the body requests a record'
    )
  }
  for (const row of entered) {
    assert.equal(row.argc, 2)
    assert.equal(row.receiver, true)
    assert.equal(row.sameCaseReady, true)
    assert.equal(row.sameArrayValue, true)
    assert.equal(row.entity.name, 'records')
    assert.equal(row.entity.id, beginning.taskId)
    assert.equal(row.entity.meta.user, 'authored')
    const ready = rows.find(
      (item) =>
        item.source === row.source &&
        item.event === 'case-ready' &&
        item.entity.name === 'records'
    )
    assert(ready)
    assert.equal(ready.entity.id, row.entity.id)
    assert(
      getters.some(
        (getter) =>
          getter.source === row.source &&
          getter.name === row.name &&
          rows.indexOf(getter) < rows.indexOf(row)
      )
    )
    assert.equal(typeof row.value.location.file, 'string')
    assert(row.value.location.file.endsWith('/contract.test.mjs'))
    assert(row.value.location.line > 0)
    assert(row.value.location.column > 0)
  }
  const prefixes = rows.filter((row) => row.event === 'async-prefix')
  const prefixCount =
    name === 'async' ||
    name === 'caught-errors' ||
    name.startsWith('primitive-async-') ||
    name.startsWith('truthy-')
      ? 2
      : name === 'async-reject-artifact' ||
          name === 'multi-async-reject' ||
          name.startsWith('unawaited-')
        ? 1
        : 0
  assert.equal(prefixes.length, prefixCount)
  for (const row of [...prefixes, ...exited]) {
    assert(
      entered.some(
        (entry) =>
          entry.source === row.source &&
          entry.name === row.name &&
          rows.indexOf(entry) < rows.indexOf(row)
      )
    )
  }
  const terminal = rows.find(
    (row) => row.event === 'case-result' && row.entity.name === 'records'
  ).entity
  assert.equal(terminal.result.state, failed ? 'failed' : 'passed')
  assert.equal(terminal.meta.user, 'authored')
  const recordCounts =
    name === 'dormant' || name === 'internal-only'
      ? [0, 0]
      : name === 'async-reject-artifact' || name === 'unawaited-artifact'
        ? [0, 1]
        : name === 'getter-throw-annotation' ||
            name.startsWith('multi-') ||
            name === 'unawaited-annotation'
          ? [1, 0]
          : name.startsWith('concurrent-')
            ? [2, 1]
            : [1, 1]
  assert.deepEqual(
    [terminal.annotations.length, terminal.artifacts.length],
    recordCounts
  )
  for (const row of body.filter(
    (row) => row.event === 'annotation-after' || row.event === 'artifact-after'
  )) {
    assert.equal(row.sameTaskValue, true)
    if (row.event === 'artifact-after') {
      assert.equal(row.sameInput, false)
      assert.equal(row.input.type, 'custom:payload')
      assert.equal(row.input.title, 'artifact-title')
      assert.deepEqual(row.input.data, { counter: 1 })
      assert(row.input.location.line > 0)
      if (name.startsWith('primitive-')) {
        assert.equal(row.value, undefined)
        assert.deepEqual(row.values.artifacts, [null])
      } else assert.deepEqual(row.input.location, row.value.location)
    }
  }
  if (name === 'mutate') {
    assert.equal(terminal.annotations[0].message, 'notice-message-changed')
    assert.equal(terminal.annotations[0].reporterAdded, 'A')
    assert.equal(terminal.artifacts[0].title, 'artifact-title-changed')
    assert.deepEqual(terminal.artifacts[0].data, { counter: 2 })
    assert.equal(terminal.artifacts[0].reporterAdded, 'A')
  } else if (name.startsWith('concurrent-')) {
    assert.deepEqual(
      terminal.annotations.map((value) => value.message),
      ['parallel-one', 'parallel-two']
    )
    assert.equal(terminal.artifacts[0].title, 'concurrent-artifact')
    const gates = rows.filter((row) => row.event === 'gate-enter')
    const releases = rows.filter((row) => row.event === 'gate-release')
    assert.equal(gates.length, 3)
    assert.deepEqual(releases.map((row) => row.message).sort(), [
      'concurrent-artifact',
      'parallel-one',
      'parallel-two',
    ])
    if (name === 'concurrent-out-of-order')
      assert.deepEqual(
        releases.map((row) => row.message),
        ['concurrent-artifact', 'parallel-two', 'parallel-one']
      )
    assert(
      Math.max(...gates.map((row) => rows.indexOf(row))) <
        Math.min(...releases.map((row) => rows.indexOf(row)))
    )
    const continued = body.find((row) => row.event === 'concurrent-after')
    assert(continued)
    assert.deepEqual(
      continued.values.map((value) => value.message ?? value.title),
      ['parallel-one', 'parallel-two', 'concurrent-artifact']
    )
    assert(
      continued.values.every((value) => value.reporterAdded === 'concurrent')
    )
    assert(
      rows.indexOf(continued) >
        Math.max(...releases.map((row) => rows.indexOf(row)))
    )
  } else if (name === 'attachment') {
    assert.equal(terminal.annotations[0].message, 'with-attachment')
    assert.equal(terminal.annotations[0].type, 'warning')
    assert.deepEqual(terminal.annotations[0].attachment, {
      path: 'https://example.invalid/notice.txt',
      contentType: 'text/plain',
    })
    assert.equal(terminal.artifacts[0].title, 'remote-artifact')
    assert.deepEqual(terminal.artifacts[0].attachments, [
      {
        path: 'https://example.invalid/image.png',
        name: 'remote-image',
        contentType: 'image/png',
      },
    ])
  } else {
    for (const annotation of terminal.annotations)
      assert.equal(annotation.message, 'notice-message')
    for (const artifact of terminal.artifacts) {
      assert.equal(artifact.type, 'custom:payload')
      assert.equal(artifact.title, 'artifact-title')
      assert.deepEqual(artifact.data, { counter: 1 })
    }
  }
  if (name === 'internal-only') {
    const returned = body.find((row) => row.event === 'internal-return')
    assert(returned)
    assert.equal(returned.sameInput, true)
    assert.equal(returned.result.type, 'internal:annotation')
    assert.equal(returned.result.annotation.message, 'low-level')
    assert.equal(returned.result.annotation.type, 'notice')
    assert.equal(returned.result.custom, 'retained')
    assert.deepEqual(
      returned.result.location,
      returned.result.annotation.location
    )
  }
  if (name.startsWith('multi-')) {
    assert.deepEqual(
      entered.map((row) => row.source),
      name === 'multi-async-reject'
        ? ['A', 'B']
        : name === 'multi-sync-throw'
          ? ['A']
          : []
    )
  }
  const caught = body.filter((row) => row.event.endsWith('-caught'))
  if (name.startsWith('primitive-')) {
    assert.equal(caught.length, 1)
    assert.equal(caught[0].event, 'annotation-caught')
    assert.equal(caught[0].error.name, 'TypeError')
    assert.match(caught[0].error.message, /undefined.*annotation/)
    assert.equal(caught[0].error.errorInstance, true)
    assert(body.some((row) => row.event === 'artifact-after'))
  } else if (name.startsWith('truthy-')) {
    assert.equal(caught.length, 2)
    for (const row of caught) {
      const error = row.error
      if (name === 'truthy-aggregate') {
        assert.equal(error.name, 'Error')
        assert.equal(error.message, 'aggregate-message')
        assert.equal(error.cause, 'aggregate-cause')
        assert.equal(error.errorInstance, true)
      } else {
        assert.equal(error.errorInstance, false)
        const value =
          name === 'truthy-text'
            ? 'truthy-reporter'
            : name === 'truthy-number'
              ? 42
              : name === 'truthy-object'
                ? {
                    message: 'plain-message',
                    custom: 'plain-custom',
                    nested: { value: 1 },
                  }
                : ['array-failure']
        assert.deepEqual(error.rawValue, value)
      }
    }
  } else if (name === 'caught-errors' || name.startsWith('multi-')) {
    assert.equal(caught.length, name === 'caught-errors' ? 2 : 1)
    for (const row of caught) {
      assert.equal(row.error.name, 'Error')
      assert.equal(
        row.error.message,
        'authored reporter ' +
          (name === 'multi-getter-throw'
            ? 'getter'
            : name === 'multi-sync-throw'
              ? 'sync'
              : 'async')
      )
      assert.equal(row.error.cause, 'reporter-cause')
    }
  } else assert.equal(caught.length, 0)
  if (name.startsWith('unawaited-')) {
    const returned = body.find((row) => row.event === 'unawaited-return')
    const completed = body.find((row) => row.event.endsWith('-after'))
    assert(returned && completed)
    assert(rows.indexOf(returned) < rows.indexOf(completed))
    assert(
      rows.indexOf(completed) < rows.findIndex((row) => row.event === 'close')
    )
  }
  const successfulCallbacks =
    name === 'basic' ||
    name === 'async' ||
    name === 'mutate' ||
    name === 'attachment'
      ? 2
      : name.startsWith('unawaited-') || name === 'multi-async-reject'
        ? 1
        : name.startsWith('concurrent-')
          ? 3
          : 0
  assert.equal(exited.length, successfulCallbacks)
}
