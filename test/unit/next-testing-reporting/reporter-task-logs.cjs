const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { createHash } = require('node:crypto')
const { pathToFileURL } = require('node:url')

const digest = (value) => createHash('sha256').update(value).digest('hex')
const readRows = async (file) =>
  (await fs.readFile(file, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

// Preserve all rows, while making the existing console-versus-task callback
// scheduling difference explicit. This verifies log state/identity rather than
// claiming that asynchronous callback dispatch has become fully conformant.
function methodEvidence(rows) {
  return {
    lifecycle: rows.filter(
      (row) => !['console', 'pending', 'identity'].includes(row.hook)
    ),
    console: rows.filter((row) => row.hook === 'console'),
    causal: rows.filter((row) => ['pending', 'identity'].includes(row.hook)),
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
  const expected = JSON.parse(
    await fs.readFile(path.join(fixtures, 'genuine.json'), 'utf8')
  )
  assert.equal(expected.version, '5.0.4')
  const pins = JSON.parse(
    await fs.readFile(path.join(fixtures, 'PINS.json'), 'utf8')
  )
  for (const [name, pin] of Object.entries(pins))
    assert.equal(digest(await fs.readFile(path.join(fixtures, name))), pin)
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
        assert.deepEqual(
          methodEvidence(trace),
          methodEvidence(expected.oneShot[observer]),
          mode + '/' + observer
        )
        const report = JSON.parse(
          await fs.readFile(path.join(out, 'report.json'), 'utf8')
        )
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
      assert.deepEqual(methods, expected.watch[variant])
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
      queuedAndCollectedFileSlotsMatchReference: !watchOnly,
      priorTestViewsRetainTheirGeneration: true,
      callbackSchedulingParityClaimed: false,
    }) + '\n'
  )
}
main().catch((error) => {
  process.stderr.write(error.stack + '\n')
  process.exitCode = 1
})
