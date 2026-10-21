import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Expected installed consumer and new evidence directory'
)
const consumer = realpathSync(consumerArg)
const output = resolve(outputArg)
const source = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../unit/next-testing-browser-resources/fixtures/native-action-output'
)
const requireConsumer = createRequire(join(consumer, 'package.json'))
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const save = (root, name, value) =>
  writeFileSync(join(root, name), JSON.stringify(value, null, 2) + '\n')
const nativeEvent = {
  type: 'mousedown',
  trusted: true,
  buttons: 1,
  button: 0,
  point: [50, 25],
  sourceConnected: true,
  targetConnected: true,
  targetDisplay: 'none',
}
mkdirSync(output)
const results = []
for (const mode of ['development', 'production']) {
  const out = join(output, mode),
    fixture = join(consumer, '.next-test-action-output-' + randomUUID())
  mkdirSync(out)
  mkdirSync(fixture)
  mkdirSync(join(fixture, 'app'))
  for (const [from, to] of [
    ['cancel.test.mjs.txt', 'cancel.test.mjs'],
    ['reporter.mjs.txt', 'reporter.mjs'],
  ])
    copyFileSync(join(source, from), join(fixture, to))
  const sourceHashes = Object.fromEntries(
    ['cancel.test.mjs', 'reporter.mjs'].map((name) => [
      name,
      hash(join(fixture, name)),
    ])
  )
  writeFileSync(
    join(fixture, 'package.json'),
    JSON.stringify({ private: true, type: 'module' })
  )
  writeFileSync(
    join(fixture, 'app/layout.jsx'),
    'export default function Layout({children}){return <html><body>{children}</body></html>}'
  )
  writeFileSync(
    join(fixture, 'app/page.jsx'),
    'export default function Page(){return <p>Owned drag</p>}'
  )
  writeFileSync(join(fixture, 'next.config.mjs'), 'export default {}')
  writeFileSync(
    join(fixture, 'next.test.config.json'),
    JSON.stringify({
      maxWorkers: 1,
      projects: [
        {
          name: 'drag-cancel',
          mode,
          fileTimeout: 90000,
          testTimeout: 90000,
          include: ['*.test.mjs'],
          browser: { enabled: true, viewport: { width: 640, height: 480 } },
        },
      ],
    })
  )
  const report = join(out, 'report.raw.json'),
    active = join(out, 'active.json'),
    consoleLog = join(out, 'console.raw.jsonl')
  const args = [
    requireConsumer.resolve('next/dist/bin/next'),
    'test',
    fixture,
    '--run',
    '--reporter',
    'json',
    join(fixture, 'reporter.mjs'),
    '--outputFile',
    report,
  ]
  const env = {
    ...process.env,
    NODE_ENV: mode,
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    DRAG_CANCEL_LOG: consoleLog,
    DRAG_CANCEL_ACTIVE: active,
  }
  for (const name of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[name]
  writeFileSync(consoleLog, '')
  save(out, 'inputs.json', {
    mode,
    args,
    sourceHashes,
    activeObservationTimeout: 25000,
    testTimeout: 90000,
    nativeTimeout: 60000,
    noObserverPreload: true,
    captureTaskResultsRequestedByExistingReporter: true,
  })
  let completed = false,
    signaled = false,
    failure
  const started = Date.now()
  const running = runOwnedNode(args, {
    cwd: fixture,
    env,
    auditDir: join(out, 'processes'),
    timeoutMs: 90000,
  }).then((result) => {
    completed = true
    return result
  })
  function cliRecord() {
    const file = join(out, 'processes/starts.jsonl')
    if (!existsSync(file)) return undefined
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((row) => row.type === 'start' && row.ppid === process.pid)
  }
  function signal(record) {
    const observed = spawnSync(
      'ps',
      ['-p', String(record.pid), '-o', 'lstart='],
      { encoding: 'utf8' }
    )
    assert.equal(observed.status, 0)
    assert.equal(observed.stdout.trim().split(/\s+/).join(' '), record.started)
    process.kill(record.pid, 'SIGINT')
    signaled = true
    save(out, 'signal.json', {
      pid: record.pid,
      started: record.started,
      signal: 'SIGINT',
      actualNativeMouseDown: existsSync(active)
        ? JSON.parse(readFileSync(active, 'utf8'))
        : null,
    })
  }
  try {
    const deadline = performance.now() + 25000
    while (!existsSync(active) && performance.now() < deadline) {
      assert(!completed, 'CLI ended before actual native mouse down callback')
      await delay(25)
    }
    assert(existsSync(active), 'Native mouse down not observed in25s')
    assert.deepEqual(JSON.parse(readFileSync(active, 'utf8')), nativeEvent)
    const record = cliRecord()
    assert(record)
    signal(record)
  } catch (error) {
    failure = error
  } finally {
    if (!completed && !signaled) {
      const record = cliRecord()
      if (record) signal(record)
    }
  }
  const result = await running
  writeFileSync(join(out, 'stdout.log'), result.stdout)
  writeFileSync(join(out, 'stderr.log'), result.stderr)
  for (const [name, digest] of Object.entries(sourceHashes))
    assert.equal(hash(join(fixture, name)), digest)
  rmSync(fixture, { recursive: true })
  save(out, 'closed.json', {
    status: result.status,
    signaled,
    fixtureRemoved: !existsSync(fixture),
    failure: failure ? String(failure) : null,
  })
  assertOwnedNodeCompleted(result, 'native action console output ' + mode)
  if (failure) throw failure
  assert.equal(result.status, 130)
  assert.equal(result.signal, null)
  assert(!result.stderr.includes('Custom reporter session is unavailable.'))
  const logs = readFileSync(consoleLog, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  assert.equal(logs.length, 1)
  const [log] = logs
  assert.deepEqual(Object.keys(log).sort(), [
    'browser',
    'content',
    'size',
    'taskId',
    'time',
    'type',
  ])
  assert.equal(log.content, 'DRAG_NATIVE_DOWN ' + JSON.stringify(nativeEvent))
  assert.equal(log.browser, true)
  assert.equal(log.type, 'stdout')
  assert.equal(log.size, 160)
  assert(
    Number.isInteger(log.time) && log.time >= started && log.time <= Date.now()
  )
  assert.equal(typeof log.taskId, 'string')
  assert(log.taskId && !log.taskId.includes('__vitest__unknown_test__'))
  const terminal = JSON.parse(readFileSync(report, 'utf8'))
  assert.deepEqual(
    Object.fromEntries(
      [
        'numTotalTests',
        'numPassedTests',
        'numFailedTests',
        'numPendingTests',
      ].map((key) => [key, terminal[key]])
    ),
    {
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 0,
    }
  )
  results.push({
    mode,
    nativeEvent,
    consoleBeforeNativeActionSettled: true,
    completeRawConsoleRetained: true,
    exit: 130,
    existingJSONContractPreserved: true,
    cleanup: true,
  })
}
save(output, 'verification.json', {
  profiles: 2,
  results,
  noObserverPreload: true,
  originalBodiesAndDeadlinesHeld: true,
  scope:
    'Existing logical-task capture reporter path; no general concurrent RPC admission.',
  open: [
    'genuine no-report cancellation parity',
    'absent-capture early reporter publication',
  ],
  stableReady: false,
})
console.log(
  JSON.stringify({
    profiles: 2,
    nativeConsoleRows: 2,
    outputBeforeNativeActionCompletion: true,
    cancelled: 2,
    cleanup: true,
  })
)
