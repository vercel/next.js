const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const { fork } = require('node:child_process')
const { createHash } = require('node:crypto')
const { serialize } = require('node:v8')
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
  const fixture = path.join(__dirname, 'fixtures/test-record-reporters')
  const model = require('./fixtures/test-record-reporters/genuine-models.json')
  const selected = only
    ? model.profiles.filter((item) =>
        only.split(',').includes(item.profile.name)
      )
    : model.profiles
  assert(selected.length || only === 'local-attachment')
  const verified = []
  for (const profile of selected) verified.push(await scenario(profile))
  if (!only || only.split(',').includes('local-attachment'))
    verified.push(await localAttachment())
  const facts = {
    scenarios: verified.length,
    actualCallbacks: verified.reduce((n, x) => n + x.actualCallbacks, 0),
    actualGetterReads: verified.reduce((n, x) => n + x.actualGetterReads, 0),
    completeCallbackRows: verified.reduce(
      (n, x) => n + x.completeCallbackRows,
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
        completeCallbackRows: 0,
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
    if (!expected.functionalOnly)
      for (const authored of expected.sourceFiles.filter(
        (item) =>
          item.name.endsWith('.mjs') && item.name !== 'vitest.config.mjs'
      )) {
        const bytes = fs.readFileSync(path.join(source, authored.name + '.txt'))
        assert.equal(
          createHash('sha256').update(bytes).digest('hex'),
          authored.sha256,
          'Frozen genuine authored source: ' + name + '/' + authored.name
        )
      }
    const file = path.join(dir, 'contract.test.mjs')
    const body = fs.readFileSync(
      path.join(source, 'contract.test.mjs.txt'),
      'utf8'
    )
    fs.writeFileSync(file, body)
    fs.copyFileSync(
      path.join(source, 'reporter.mjs.txt'),
      path.join(dir, 'reporter.mjs')
    )
    const reporters = [path.join(dir, 'reporter.mjs')]
    if (expected.profile.multi) {
      fs.copyFileSync(
        path.join(source, 'second-reporter.mjs.txt'),
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
    const events = [],
      packets = [],
      records = [],
      replies = [],
      operations = new Set()
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
        events.push(message.event)
        if (message.event.type === 'file-collected')
          initialTree = message.event.taskTree
        if (message.event.type === 'task-update') packets.push(message.event)
        if (
          message.event.type === 'test-annotation' ||
          message.event.type === 'test-artifact'
        )
          records.push(message.event)
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
      records.push(message.event)
      const operation = (async () => {
        let outcome
        try {
          const value = await session.onTestRecord(message.event)
          outcome = { kind: 'return', value }
        } catch (error) {
          outcome = { kind: 'throw', error }
        }
        replies.push({
          requestId: message.requestId,
          event: message.event,
          outcome,
        })
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
      // Preserve native nonenumerable Error fields in the actual IPC evidence.
      fs.writeFileSync(
        path.join(dir, (settings.prefix || '') + 'wire-v8.bin'),
        serialize({
          packets,
          records,
          replies,
          result,
          events,
          initialTree,
          relayFailure,
        })
      )
      for (const [name, value] of Object.entries({
        packets,
        records,
        replies,
        result,
        events,
      }))
        fs.writeFileSync(
          path.join(dir, (settings.prefix || '') + name + '.json'),
          JSON.stringify(value ?? { noResult: true }, null, 2) + '\n'
        )
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
    fs.writeFileSync(
      path.join(dir, (settings.prefix || '') + 'packets.json'),
      JSON.stringify(packets, null, 2) + '\n'
    )
    fs.writeFileSync(
      path.join(dir, (settings.prefix || '') + 'records.json'),
      JSON.stringify(records, null, 2) + '\n'
    )
    fs.writeFileSync(
      path.join(dir, (settings.prefix || '') + 'replies.json'),
      JSON.stringify(replies, null, 2) + '\n'
    )
    fs.writeFileSync(
      path.join(dir, (settings.prefix || '') + 'result.json'),
      JSON.stringify(result ?? { noResult: true }, null, 2) + '\n'
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
        completeCallbackRows: 0,
        sessionDisposed: true,
        continuation,
        rows,
        records,
        copyCalls,
      }
    }
    const ids = new Map()
    for (const row of rows)
      if (row.entity) {
        const genuine = expected.trace.find(
          (item) => item.entity?.name === row.entity.name
        )
        assert(genuine, 'actual unknown TestCase')
        ids.set(row.entity.id, genuine.entity.id)
      }
    function normalize(value) {
      if (typeof value === 'string')
        return ids.get(value) ?? value.split(dir).join('<fixture-root>')
      if (Array.isArray(value)) return value.map(normalize)
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value).map(([key, v]) => [key, normalize(v)])
        )
      return value
    }
    const actual = normalize(rows)
    // Full callback rows preserve every captured entity, payload and receiver field.
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
    assert.deepEqual(
      callbacks(actual),
      callbacks(expected.trace),
      name + ': complete callback rows'
    )
    const bodyEvents = (value) =>
      value.filter(
        (item) =>
          item.source === 'body' && !['begin', 'following'].includes(item.event)
      )
    assert.deepEqual(
      bodyEvents(actual),
      bodyEvents(expected.trace),
      name + ': complete authored record continuations'
    )
    const terminals = (value) =>
      value
        .filter((item) => item.event === 'case-result')
        .map((item) => ({
          source: item.source,
          name: item.entity.name,
          state: item.entity.result.state,
          annotations: item.entity.annotations,
          artifacts: item.entity.artifacts,
          meta: item.entity.meta,
        }))
    assert.deepEqual(
      terminals(actual),
      terminals(expected.trace),
      name +
        ': controller-owned records persist through actual worker result packs'
    )
    assert.deepEqual(
      result.cases.map((value) => value.status),
      expected.report.testResults[0].assertionResults.map((value) =>
        value.status === 'passed' ? 'passed' : 'failed'
      )
    )
    assert.equal(
      rows.filter((item) => item.event === 'close').length,
      expected.profile.multi ? 2 : 1
    )
    assert.equal(result.interrupted, false)
    return {
      name,
      actualCallbacks: rows.filter((item) => item.event === 'callback-enter')
        .length,
      actualGetterReads: rows.filter((item) => item.event === 'getter').length,
      completeCallbackRows: callbacks(rows).length,
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
