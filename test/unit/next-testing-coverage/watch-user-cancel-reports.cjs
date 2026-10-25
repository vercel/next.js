const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { EventEmitter } = require('node:events')
const expected = require('./watch-user-cancel.expected.json')
const repo =
  process.env.NEXT_TEST_COVERAGE_CONSUMER_ROOT ||
  path.resolve(__dirname, '../../..')
const source = path.join(
  __dirname,
  '../app-dir/next-testing-stable-release-gaps/fixtures/standard-coverage'
)
const mode =
  process.argv.find((value) => value.startsWith('--mode='))?.split('=')[1] ||
  'development'
const kind =
  process.argv.find((value) => value.startsWith('--kind='))?.split('=')[1] ||
  'initial'
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const cases = (result) =>
  result.testResults.map((file) => ({
    file: path.basename(file.name),
    status: file.status,
    cases: file.assertionResults.map((test) =>
      Object.fromEntries(
        [
          'ancestorTitles',
          'fullName',
          'status',
          'title',
          'failureMessages',
          'meta',
          'tags',
          'benchmarks',
        ]
          .filter((key) => key in test)
          .map((key) => [key, test[key]])
      )
    ),
  }))
const normalizeTrace = (trace) =>
  trace.map(({ pid: _pid, threadId: _threadId, ...event }) => event)
const parallelExpected =
  kind === 'parallel'
    ? require('./watch-user-cancel-parallel.expected.json')
    : undefined
const parallelObservations = []
function compareParallel(capture, phase) {
  const result = capture.result
  const events = result.next.events
  const started = events.filter((event) => event.type === 'file-start')
  const files = new Map(
    started.map((event) => [event.entry.id, path.basename(event.entry.file)])
  )
  assert.equal(files.size, 2)
  const selected = events
    .find((event) => event.type === 'run-start')
    .specificationOrder.map((id) => {
      assert.ok(files.has(id))
      return files.get(id)
    })
  assert.ok(
    parallelExpected.selectedOrders[phase].some(
      (order) => JSON.stringify(order) === JSON.stringify(selected)
    )
  )
  const actualCases = cases(result)
  assert.deepEqual(
    actualCases.map((file) => file.file),
    selected
  )
  for (const file of actualCases)
    assert.deepEqual(file, parallelExpected.caseReports[phase][file.file])
  assert.deepEqual(capture.coverage, parallelExpected.coverageReports[phase])
  const actualTrace = normalizeTrace(capture.trace)
  for (const label of ['a', 'b'])
    assert.deepEqual(
      actualTrace.filter(
        (event) => event.label === label && event.event !== 'worker-exit'
      ),
      parallelExpected.authoredTraces[phase][label]
    )
  assert.ok(actualTrace.every((event) => ['a', 'b'].includes(event.label)))
  // Process-exit callbacks are a separate, visible lifetime contract. Keeping
  // them here must not turn a case/map/order qualification into a trace claim.
  const actualExits = actualTrace.filter(
    (event) => event.event === 'worker-exit'
  )
  const referenceExits = Object.values(parallelExpected.authoredTraces[phase])
    .flat()
    .filter((event) => event.event === 'worker-exit')
  parallelObservations.push({
    phase,
    selected,
    ...capture,
    processExit: {
      reference: referenceExits,
      actual: actualExits,
      compatible:
        JSON.stringify(actualExits) === JSON.stringify(referenceExits),
    },
  })
}
let profiles = 0,
  completeReports = 0,
  closedWorkers = 0
async function profile(row) {
  const parallel = row.kind === 'parallel'
  const fixture = fs.mkdtempSync(
    path.join(repo, '.next-test-watch-user-cancel-')
  )
  const controls = path.join(fixture, '.next/cancel-controls')
  const directory = path.join(
    fixture,
    parallel ? 'parallel-cancel' : 'cancel-settlement'
  )
  fs.mkdirSync(controls, { recursive: true })
  fs.mkdirSync(directory)
  for (const name of ['subject.mjs', 'unimported.mjs', 'excluded.mjs'])
    fs.copyFileSync(path.join(source, name), path.join(fixture, name))
  fs.writeFileSync(path.join(fixture, 'next.config.mjs'), 'export default {}\n')
  if (parallel) {
    for (const label of ['a', 'b'])
      fs.writeFileSync(
        path.join(fixture, `${label}.case.mjs`),
        parallelExpected.sources[label]
      )
  } else {
    fs.writeFileSync(
      path.join(fixture, 'contract.case.mjs'),
      expected.sources[row.kind]
    )
    fs.writeFileSync(
      path.join(fixture, 'z-queued.case.mjs'),
      row.kind === 'prior'
        ? expected.sources.priorSecond
        : "import{test,beforeEach,afterEach}from'vitest';import{appendFileSync,mkdirSync}from'node:fs';mkdirSync('cancel-settlement',{recursive:true});const record=event=>appendFileSync('cancel-settlement/trace.jsonl',JSON.stringify({event,pid:process.pid})+'\\n');record('second-module-evaluated');beforeEach(()=>record('second-beforeEach'));afterEach(()=>record('second-afterEach'));test('queued second file',()=>record('second-body'));\n"
    )
    fs.writeFileSync(
      path.join(fixture, 'second-subject.mjs'),
      'export function second() { return 2 }\n'
    )
  }
  const coverage = {
    provider: 'v8',
    enabled: true,
    include: [
      'subject.mjs',
      ...(row.kind === 'prior' ? ['second-subject.mjs'] : []),
      'unimported.mjs',
    ],
    ...(row.kind === 'initial'
      ? { exclude: ['contract.case.mjs', 'excluded.mjs'] }
      : {}),
    reporter: ['json'],
    reportsDirectory: path.basename(directory),
    clean: true,
    cleanOnRerun: row.cleanOnRerun,
  }
  fs.writeFileSync(
    path.join(fixture, 'next.test.config.json'),
    JSON.stringify({
      test: {
        include: parallel
          ? ['a.case.mjs', 'b.case.mjs']
          : ['contract.case.mjs', 'z-queued.case.mjs'],
        mode,
        maxWorkers: parallel ? 2 : 1,
        coverage,
      },
    })
  )
  // The real CLI receives keyboard bytes over a pipe with terminal capabilities.
  // Separate PTY qualification also exercises the same interactive defaults.
  const launcher = path.join(controls, 'terminal.cjs')
  fs.writeFileSync(
    launcher,
    `Object.defineProperty(process.stdout,'isTTY',{value:true});Object.defineProperty(process.stdin,'isTTY',{value:true});process.stdin.setRawMode=()=>process.stdin;require(${JSON.stringify(path.join(repo, 'packages/next/dist/bin/next'))});\n`
  )
  const environment = {
    ...process.env,
    NODE_ENV: mode,
    NEXT_TELEMETRY_DISABLED: '1',
    NO_COLOR: '1',
    TERM: 'xterm',
  }
  delete environment.CI
  const events = new EventEmitter()
  let output = '',
    errors = '',
    child,
    observer,
    closed = false
  const change = () => events.emit('change')
  function wait(predicate, label) {
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(
        () => finish(new Error(`${label} timed out.\n${output}\n${errors}`)),
        60000
      )
      function finish(error) {
        clearTimeout(deadline)
        events.removeListener('change', check)
        error ? reject(error) : resolve()
      }
      function check() {
        if (predicate()) return finish()
        if (closed)
          finish(new Error(`${label}: CLI closed.\n${output}\n${errors}`))
      }
      events.on('change', check)
      check()
    })
  }
  const trace = () =>
    fs.existsSync(path.join(directory, 'trace.jsonl'))
      ? fs
          .readFileSync(path.join(directory, 'trace.jsonl'), 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(JSON.parse)
      : []
  function capture() {
    return {
      result: read(path.join(fixture, 'result.json')),
      coverage: Object.fromEntries(
        Object.entries(read(path.join(directory, 'coverage-final.json'))).map(
          ([file, value]) => [
            path.basename(file),
            { ...value, path: path.basename(value.path) },
          ]
        )
      ),
      trace: trace(),
    }
  }
  const ready = () =>
    (output.match(/Waiting for file changes\.\.\./g) || []).length
  try {
    observer = fs.watch(fixture, { recursive: true }, change)
    child = spawn(
      process.execPath,
      [
        launcher,
        'test',
        fixture,
        '--watch',
        `--max-workers=${parallel ? 2 : 1}`,
        '--reporter=default',
        '--reporter=json',
        '--outputFile=result.json',
      ],
      { cwd: repo, env: environment, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    child.stdout.on('data', (chunk) => {
      output += chunk
      change()
    })
    child.stderr.on('data', (chunk) => {
      errors += chunk
      change()
    })
    child.once('exit', () => {
      closed = true
      change()
    })
    let baseline
    if (row.kind === 'prior') {
      await wait(() => ready() > 0, 'actual baseline')
      baseline = capture()
      fs.unlinkSync(path.join(directory, 'trace.jsonl'))
      fs.writeFileSync(path.join(controls, 'gate-mode'), 'active')
      child.stdin.write('r')
    }
    const started = parallel ? ['a-started', 'b-started'] : ['gate-started']
    await wait(
      () => started.every((name) => fs.existsSync(path.join(controls, name))),
      'actual authored subject execution'
    )
    const workers = new Set(
      trace()
        .filter((event) => event.event === 'body-start')
        .map((event) => event.pid)
    )
    assert.equal(workers.size, parallel ? 2 : 1)
    child.stdin.write('c')
    await wait(
      () => output.includes('Test run cancelled. Watching for file changes...'),
      'closed cancellation publication'
    )
    const cancelled = capture()
    if (parallel) compareParallel(cancelled, 'cancelled')
    else {
      assert.deepEqual(cases(cancelled.result), expected.caseReports[row.cases])
      assert.deepEqual(
        cancelled.coverage,
        expected.coverageReports[row.coverage]
      )
      assert.equal(cancelled.result.success, true)
      assert.deepEqual(
        normalizeTrace(cancelled.trace),
        expected.authoredTraces[row.trace]
      )
    }
    assert.equal(cancelled.result.success, true)
    for (const worker of workers)
      for (const pid of [worker, -worker])
        assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    if (baseline)
      assert.deepEqual(
        cancelled.result.testResults.find(
          (file) => path.basename(file.name) === 'z-queued.case.mjs'
        ),
        baseline.result.testResults.find(
          (file) => path.basename(file.name) === 'z-queued.case.mjs'
        )
      )
    const beforeRecovery = ready()
    if (parallel) {
      fs.unlinkSync(path.join(directory, 'trace.jsonl'))
      // Each unchanged parallel body checks release before installing its watch.
      for (const label of ['a', 'b'])
        fs.writeFileSync(path.join(controls, `${label}-release`), 'release')
      child.stdin.write('r')
    } else {
      fs.rmSync(path.join(controls, 'gate-started'), { force: true })
      child.stdin.write('r')
      await wait(
        () => fs.existsSync(path.join(controls, 'gate-started')),
        'actual recovery body readiness'
      )
      fs.writeFileSync(path.join(controls, 'gate-release'), 'release')
    }
    await wait(() => ready() > beforeRecovery, 'actual recovery')
    const recovery = capture()
    if (parallel) compareParallel(recovery, 'recovery')
    else {
      assert.deepEqual(
        cases(recovery.result),
        expected.caseReports[row.recovery.cases]
      )
      assert.deepEqual(
        recovery.coverage,
        expected.coverageReports[row.recovery.coverage]
      )
    }
    assert.equal(recovery.result.success, true)
    assert.ok(recovery.trace.some((event) => event.event === 'body-finished'))
    child.stdin.write('q')
    await wait(() => closed, 'watcher quit')
    assert.equal(child.exitCode, 1)
    profiles++
    completeReports += 2
    closedWorkers += workers.size
  } finally {
    observer?.close()
    if (child && !closed) {
      const exit = new Promise((resolve) => child.once('exit', resolve))
      child.kill('SIGINT')
      const deadline = setTimeout(() => child.kill('SIGKILL'), 15000)
      await exit
      clearTimeout(deadline)
    }
    child?.stdin.destroy()
    if (process.env.NEXT_TEST_COVERAGE_KEEP_RESULTS) {
      fs.writeFileSync(path.join(fixture, 'watch.stdout'), output)
      fs.writeFileSync(path.join(fixture, 'watch.stderr'), errors)
    } else fs.rmSync(fixture, { recursive: true, force: true })
  }
}
;(async () => {
  const rows = parallelExpected
    ? [{ mode, kind, cleanOnRerun: true }]
    : expected.profiles.filter((row) => row.mode === mode && row.kind === kind)
  assert.ok(rows.length)
  for (const row of rows) await profile(row)
  process.stdout.write(
    JSON.stringify({
      mode,
      kind,
      profiles,
      completeReports,
      closedWorkers,
      ...(parallelExpected ? { parallelObservations } : {}),
    }) + '\n'
  )
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
