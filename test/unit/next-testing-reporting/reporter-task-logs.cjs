const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { pathToFileURL } = require('node:url')

const readRows = async (file) =>
  (await fs.readFile(file, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

function assertLogs(logs, contents) {
  assert.deepEqual(
    logs.map((log) => log.content.trimEnd()),
    contents
  )
  for (const log of logs) {
    assert.equal(log.type, log.content.includes('after') ? 'stderr' : 'stdout')
    assert.equal(log.size, 1)
    assert.equal(log.timeIsNumber, true)
  }
}

function assertView(view) {
  assert.equal(view.freshArray, true)
  assert.equal(view.stableRows, true)
  assert.equal(view.mutationIsolated, true)
  for (const log of view.logs) {
    assert.deepEqual(log.keys, [
      'content',
      'origin',
      'size',
      'taskId',
      'time',
      'type',
    ])
    assert.equal(log.timeIsNumber, true)
    assert.equal(log.taskIdIsString, true)
  }
  for (const child of view.children) assertView(child)
}

function assertCompletedModule(module) {
  assertView(module)
  assert.equal(module.type, 'module')
  assertLogs(module.logs, [
    'collection-root',
    'root-beforeAll',
    'root-afterAll',
  ])
  assert.equal(module.children.length, 1)
  const suite = module.children[0]
  assert.equal(suite.name, 'outer')
  assert.equal(suite.type, 'suite')
  assertLogs(suite.logs, ['suite-beforeAll', 'suite-afterAll'])
  assert.deepEqual(
    suite.children.map((test) => test.name),
    ['pass', 'retry', 'repeat', 'skipped', 'finish']
  )
  for (const [test, contents] of [
    [suite.children[0], ['beforeEach', 'case-pass', 'afterEach']],
    [
      suite.children[1],
      [
        'beforeEach',
        'case-retry-0',
        'afterEach',
        'beforeEach',
        'case-retry-1',
        'afterEach',
      ],
    ],
    [
      suite.children[2],
      [
        'beforeEach',
        'case-repeat-0',
        'afterEach',
        'beforeEach',
        'case-repeat-1',
        'afterEach',
      ],
    ],
    [suite.children[3], []],
    [suite.children[4], ['beforeEach', 'case-finish', 'afterEach']],
  ])
    assertLogs(test.logs, contents)
}

function assertOneShot(trace, observer, events) {
  const lifecycle = trace.filter(
    (row) => !['console', 'pending', 'identity'].includes(row.hook)
  )
  const queuedEmpty = observer === 'queued-empty'
  assert.deepEqual(
    lifecycle.map((row) => row.hook),
    queuedEmpty
      ? ['queued', 'collected', 'module', 'end', 'close']
      : [
          'queued',
          'collected',
          'case',
          'case',
          'case',
          'case',
          'case',
          'module',
          'end',
          'close',
        ]
  )
  const completed = trace.find((row) => row.hook === 'module')
  const end = trace.find((row) => row.hook === 'end')
  const close = trace.find((row) => row.hook === 'close')
  assert.equal(end.reason, 'passed')
  assert.deepEqual(end.errors, [])
  if (queuedEmpty) {
    assert.deepEqual(lifecycle[0].logs, [])
    assert.equal(lifecycle[1].differentModule, true)
    assert.deepEqual(lifecycle[1].queued, [])
    assert.deepEqual(lifecycle[1].collected, [])
    assert.equal(completed.sameCollected, true)
    assert.equal(end.sameCollected, true)
    for (const row of [completed, end, close]) {
      assert.deepEqual(row.queued, [])
      assertLogs(row.collected, ['late-root'])
    }
    assert.equal(completed.tests.length, 1)
    assert.equal(completed.tests[0].name, 'empty collection logs')
    assertLogs(completed.tests[0].logs, ['body'])
    return
  }
  assert.equal(completed.sameModule, true)
  assert.equal(completed.observerIdentityRetained, true)
  assert.equal(end.sameModule, true)
  for (const row of [completed, end, close]) assertCompletedModule(row.module)
  assert.deepEqual(
    lifecycle.filter((row) => row.hook === 'case').map((row) => row.test.name),
    ['pass', 'retry', 'repeat', 'skipped', 'finish']
  )
  for (const row of lifecycle) {
    if (row.module) assertView(row.module)
    if (row.test) assertView(row.test)
  }
  const consoleRows = trace.filter((row) => row.hook === 'console')
  const producerLogs = events.filter(
    (event) => event.type === 'output' && event.console
  )
  assert.equal(consoleRows.length, observer === 'observer' ? 23 : 0)
  if (observer === 'observer') {
    assert.deepEqual(
      consoleRows.map(({ log }) => [log.content, log.type, log.size]),
      producerLogs.map((event) => [
        event.text,
        event.stream,
        event.console.size,
      ])
    )
    assert.equal(consoleRows[0].owner, null)
    assert.equal(consoleRows[0].alreadyRetained, null)
    assert(consoleRows.slice(1).every((row) => row.alreadyRetained === true))
  }
  const pending = trace.filter((row) => row.hook === 'pending')
  const identity = trace.filter((row) => row.hook === 'identity')
  assert.equal(pending.length, observer === 'pending' ? 1 : 0)
  assert.equal(identity.length, observer === 'pending' ? 1 : 0)
  if (observer === 'pending') {
    assertCompletedModule(pending[0].module)
    assert.equal(identity[0].retainedRowIsEventualCallbackRow, true)
    assert(trace.indexOf(pending[0]) < trace.indexOf(identity[0]))
  }
}

function assertWatch(methods, variant) {
  assert.deepEqual(
    methods.map((row) => row.hook),
    ['module', 'end', 'module', 'end']
  )
  function snapshot(value, generation, first = false) {
    const shared = variant === 'shared'
    const moduleLogs = shared
      ? generation === 1
        ? ['watch-collection-LABEL1']
        : ['watch-collection-LABEL1', 'watch-collection-LABEL2']
      : first || generation === 1
        ? []
        : ['watch-empty-collection-2']
    assertLogs(value.module, moduleLogs)
    assert.equal(value.tests.length, 1)
    assert.equal(
      value.tests[0].name,
      shared ? 'watch' : 'watch empty file logs'
    )
    const bodyGeneration = first ? 1 : generation
    assertLogs(value.tests[0].logs, [
      shared
        ? 'watch-body-LABEL' + bodyGeneration
        : 'watch-empty-body-' + bodyGeneration,
    ])
  }
  for (const generation of [1, 2]) {
    const completed = methods[(generation - 1) * 2]
    const end = methods[(generation - 1) * 2 + 1]
    snapshot(completed.snapshot, generation)
    snapshot(end.current, generation)
    snapshot(end.first, generation, true)
    assert.equal(end.reason, 'passed')
    assert.deepEqual(end.errors, [])
    assert.equal(end.sameAsFirst, generation === 1)
    assert.equal(
      end.retainedFirstSnapshotUnchanged,
      generation === 1 || variant === 'empty'
    )
    assert.equal(
      end.retainedRowIdentity,
      generation === 1 || variant === 'empty'
    )
  }
}

function assertProducerRows(trace, events, queuedEmpty) {
  const collected = events.find((event) => event.type === 'file-collected')
  assert(collected, 'Logs require actual collected producer declarations')
  const nodes = []
  function visit(task, root = false) {
    nodes.push({
      id: task.id,
      name: root ? 'module' : task.name,
      type: root ? 'module' : task.type,
    })
    for (const child of task.tasks ?? []) visit(child)
  }
  visit(collected.taskTree, true)
  const rows = events.filter(
    (event) => event.type === 'output' && event.console
  )
  const actual = trace.find((row) => row.hook === 'module')
  assert(actual)
  const views = []
  function view(entity) {
    views.push(entity)
    for (const child of entity.children ?? []) view(child)
  }
  if (queuedEmpty) {
    views.push({ type: 'module', name: 'module', logs: actual.collected })
    for (const test of actual.tests) views.push({ type: 'test', ...test })
  } else view(actual.module)
  assert.equal(views.length, nodes.length)
  for (const entity of views) {
    const producer = nodes.find(
      (node) => node.type === entity.type && node.name === entity.name
    )
    assert(producer, entity.name)
    const expected = rows
      .filter((event) => event.console.taskId === producer.id)
      .map((event) => ({
        content: event.text || '<empty line>',
        type: event.stream,
        size: event.console.size,
        timeIsNumber: Number.isFinite(event.timestamp),
      }))
    assert.deepEqual(
      entity.logs.map(({ content, type, size, timeIsNumber }) => ({
        content,
        type,
        size,
        timeIsNumber,
      })),
      expected,
      entity.name
    )
  }
}

async function main() {
  const selection = process.argv[2] ?? 'all'
  assert(['all', '--watch-only'].includes(selection))
  const watchOnly = selection === '--watch-only'
  const repo = path.resolve(__dirname, '../../..')
  const fixtures = path.join(__dirname, 'fixtures/task-logs')
  const { runOwnedNode, assertOwnedNodeCompleted } = await import(
    pathToFileURL(
      path.join(
        repo,
        'test/e2e/app-dir/next-testing-package/process-supervisor.mjs'
      )
    ).href
  )
  const evidence = await fs.mkdtemp(
    path.join(os.tmpdir(), 'next-task-logs-evidence-')
  )
  let profiles = 0,
    retainedConsoleRows = 0,
    comparedRows = 0,
    engineConsoleRows = 0
  for (const mode of watchOnly ? [] : ['development', 'production']) {
    for (const observer of ['plain', 'observer', 'pending', 'queued-empty']) {
      const queuedEmpty = observer === 'queued-empty'
      const body = await fs.readFile(
        path.join(
          fixtures,
          queuedEmpty ? 'queued-empty.case.mjs.txt' : 'contract.test.mjs.txt'
        )
      )
      const fixture = await fs.mkdtemp(path.join(repo, '.next-test-task-logs-'))
      const out = path.join(evidence, mode + '-' + observer)
      await fs.mkdir(out)
      let joined = false,
        verified = false
      try {
        await fs.symlink(
          path.join(repo, 'node_modules'),
          path.join(fixture, 'node_modules'),
          'dir'
        )
        await fs.writeFile(
          path.join(fixture, 'package.json'),
          '{"type":"module","private":true}\n'
        )
        await fs.writeFile(
          path.join(fixture, 'next.config.mjs'),
          'export default {}\n'
        )
        await fs.writeFile(path.join(fixture, 'contract.case.mjs'), body)
        await fs.copyFile(
          path.join(
            fixtures,
            queuedEmpty ? 'queued-reporter.mjs.txt' : 'reporter.mjs.txt'
          ),
          path.join(fixture, 'reporter.mjs')
        )
        await fs.writeFile(
          path.join(fixture, 'options.json'),
          JSON.stringify({ mode: observer })
        )
        await fs.writeFile(
          path.join(fixture, 'next.test.config.json'),
          JSON.stringify({
            test: {
              mode,
              watch: false,
              maxWorkers: 1,
              fileParallelism: false,
              include: ['contract.case.mjs'],
              reporters: ['./reporter.mjs', 'json'],
              outputFile: path.join(out, 'report.json'),
            },
          })
        )
        const result = await runOwnedNode(
          [
            path.join(repo, 'packages/next/dist/bin/next'),
            'test',
            fixture,
            '--run',
          ],
          {
            cwd: fixture,
            env: {
              ...process.env,
              NODE_ENV: mode,
              NEXT_TELEMETRY_DISABLED: '1',
              NO_COLOR: '1',
              FORCE_COLOR: '0',
            },
            timeoutMs: 120000,
            auditDir: path.join(out, 'processes'),
          }
        )
        await fs.writeFile(path.join(out, 'owner.json'), JSON.stringify(result))
        for (const name of [
          'watch-stdout.log',
          'watch-stderr.log',
          'watch-exit.json',
        ]) {
          try {
            await fs.copyFile(path.join(fixture, name), path.join(out, name))
          } catch (error) {
            if (error.code !== 'ENOENT') throw error
          }
        }
        assertOwnedNodeCompleted(
          result,
          'canonical reporter task logs ' + mode + '/' + observer
        )
        joined = true
        assert.equal(result.status, 0, result.stderr)
        assert.equal(result.signal, null)
        const trace = await readRows(path.join(fixture, 'trace.jsonl'))
        await fs.copyFile(
          path.join(fixture, 'trace.jsonl'),
          path.join(out, 'trace.jsonl')
        )
        const report = JSON.parse(
          await fs.readFile(path.join(out, 'report.json'), 'utf8')
        )
        assertOneShot(trace, observer, report.next.events)
        assertProducerRows(trace, report.next.events, queuedEmpty)
        assert.equal(report.success, true)
        assert.equal(report.numTotalTests, queuedEmpty ? 1 : 5)
        assert.equal(report.numPassedTests, queuedEmpty ? 1 : 4)
        assert.equal(report.numPendingTests, queuedEmpty ? 0 : 1)
        const consoleRows = report.next.events.filter(
          (event) => event.type === 'output' && event.console
        )
        assert.equal(consoleRows.length, queuedEmpty ? 2 : 23)
        retainedConsoleRows += consoleRows.length
        comparedRows += trace.length
        assert.deepEqual(
          await fs.readFile(path.join(fixture, 'contract.case.mjs')),
          body
        )
        profiles++
        verified = true
      } finally {
        if (joined && verified)
          await fs.rm(fixture, { recursive: true, force: true })
      }
    }
  }

  for (const variant of ['shared', 'empty']) {
    const fixture = await fs.mkdtemp(
      path.join(repo, '.next-test-task-logs-watch-')
    )
    const out = path.join(evidence, 'watch-' + variant)
    await fs.mkdir(out)
    await fs.writeFile(path.join(out, 'trace.jsonl'), '')
    await fs.symlink(
      path.join(out, 'trace.jsonl'),
      path.join(fixture, 'trace.jsonl')
    )
    const traceLink = await fs.lstat(path.join(fixture, 'trace.jsonl'), {
      bigint: true,
    })
    let joined = false,
      verified = false
    try {
      await fs.symlink(
        path.join(repo, 'node_modules'),
        path.join(fixture, 'node_modules'),
        'dir'
      )
      await fs.writeFile(
        path.join(fixture, 'package.json'),
        '{"type":"module","private":true}\n'
      )
      await fs.writeFile(
        path.join(fixture, 'next.config.mjs'),
        'export default {}\n'
      )
      const watchBody = await fs.readFile(
        path.join(
          fixtures,
          variant === 'empty'
            ? 'watch-empty.case.mjs.txt'
            : 'watch.case.mjs.txt'
        ),
        'utf8'
      )
      await fs.writeFile(
        path.join(fixture, 'watch.case.mjs'),
        watchBody.replaceAll('LABEL', 'LABEL1')
      )
      await fs.copyFile(
        path.join(fixtures, 'watch-reporter.mjs.txt'),
        path.join(fixture, 'reporter.mjs')
      )
      await fs.writeFile(
        path.join(fixture, 'next.test.config.json'),
        JSON.stringify({
          test: {
            mode: 'development',
            watch: true,
            maxWorkers: 1,
            fileParallelism: false,
            include: ['watch.case.mjs'],
          },
        })
      )
      const result = await runOwnedNode(
        [
          path.join(fixtures, 'watch-driver.cjs'),
          fixture,
          path.join(repo, 'packages/next/dist/bin/next'),
          'next',
          out,
        ],
        {
          cwd: fixture,
          env: {
            ...process.env,
            NODE_ENV: 'development',
            NEXT_TELEMETRY_DISABLED: '1',
            NO_COLOR: '1',
            FORCE_COLOR: '0',
          },
          timeoutMs: 120000,
          auditDir: path.join(out, 'processes'),
        }
      )
      await fs.writeFile(path.join(out, 'owner.json'), JSON.stringify(result))
      assertOwnedNodeCompleted(
        result,
        'canonical reporter task logs watch generations'
      )
      joined = true
      assert.equal(result.status, 0, result.stderr)
      assert.equal(result.signal, null)
      const trace = await readRows(path.join(fixture, 'trace.jsonl'))
      assert.equal(
        await fs.realpath(path.join(fixture, 'trace.jsonl')),
        await fs.realpath(path.join(out, 'trace.jsonl'))
      )
      const retainedLink = await fs.lstat(path.join(fixture, 'trace.jsonl'), {
        bigint: true,
      })
      assert.equal(retainedLink.isSymbolicLink(), true)
      assert.equal(retainedLink.mtimeNs, traceLink.mtimeNs)
      const subscriptions = await readRows(
        path.join(out, 'watch-subscriptions.jsonl')
      )
      assert(
        subscriptions.length > 0,
        'Observe actual watch input subscriptions'
      )
      const artifactRoot = await fs.realpath(out)
      for (const { directories } of subscriptions) {
        for (const watched of [
          ...directories.directories,
          ...(directories.dependencyFiles ?? []),
        ]) {
          const resolved = await fs
            .realpath(watched)
            .catch(() => path.resolve(watched))
          const relative = path.relative(resolved, artifactRoot)
          assert(
            relative.startsWith('..' + path.sep) || path.isAbsolute(relative),
            'Owned live artifacts must remain outside every actual watched root: ' +
              watched
          )
        }
      }
      const methods = trace.filter((row) =>
        ['module', 'end'].includes(row.hook)
      )
      assertWatch(methods, variant)
      assert.equal(trace.filter((row) => row.hook === 'end').length, 2)
      assert.equal(
        await fs.readFile(path.join(fixture, 'watch.case.mjs'), 'utf8'),
        watchBody
          .replaceAll('LABEL', 'LABEL2')
          .replace('const generation = 1', 'const generation = 2')
      )
      const childExit = JSON.parse(
        await fs.readFile(path.join(out, 'watch-exit.json'), 'utf8')
      )
      assert.deepEqual(childExit, { code: 0, signal: null })
      const engineResult = JSON.parse(
        await fs.readFile(path.join(out, 'watch-engine-result.json'), 'utf8')
      )
      assert.equal(engineResult.status, 'cancelled')
      const events = await readRows(path.join(out, 'watch-events.jsonl'))
      assert.equal(
        events.filter(
          (event) => event.type === 'run-end' && event.status === 'passed'
        ).length,
        2
      )
      assert.equal(
        events.filter(
          (event) => event.type === 'case-end' && event.status === 'passed'
        ).length,
        2
      )
      const produced = events.filter(
        (event) => event.type === 'output' && event.console
      )
      assert.equal(produced.length, variant === 'shared' ? 4 : 3)
      engineConsoleRows += produced.length
      profiles++
      comparedRows += methods.length
      verified = true
    } finally {
      if (joined && verified)
        await fs.rm(fixture, { recursive: true, force: true })
    }
  }
  assert.equal(profiles, watchOnly ? 2 : 10)
  assert.equal(retainedConsoleRows, watchOnly ? 0 : 142)
  assert.equal(comparedRows, watchOnly ? 8 : 128)
  assert.equal(engineConsoleRows, 7)
  process.stdout.write(
    JSON.stringify({
      profiles,
      oneShotProfiles: watchOnly ? 0 : 8,
      watchGenerations: 4,
      retainedConsoleRows,
      comparedRows,
      engineConsoleRows,
      publicCLIProfiles: watchOnly ? 0 : 8,
      engineComponentProfiles: 2,
      publicWatchReporterAdmission: false,
      realProducerRows: true,
      noConsoleObserverRetainsLogs: true,
      pendingStateAndEventualCallbackRowIdentity: !watchOnly,
      freshArraysWithRetainedRows: !watchOnly,
      fileLogsSharedAcrossWatchGenerations: true,
      absentFileListsRetainTheirActualOwner: true,
      queuedAndCollectedFileSlotsMatchProducer: !watchOnly,
      priorTestViewsRetainTheirGeneration: true,
      callbackSchedulingParityClaimed: false,
    }) + '\n'
  )
}
main().catch((error) => {
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
