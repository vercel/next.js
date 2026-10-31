import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  watch,
  watchFile,
  unwatchFile,
  copyFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg)
const consumer = resolve(consumerArg),
  output = resolve(outputArg)
const source = process.argv.includes('--source')
const load = createRequire(join(consumer, 'package.json'))
if (!source)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const row = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/istanbul-provider/production-typescript-cancel-pristine.json'
    )
  )
)
const configured = JSON.parse(row.config.replace(/^export default /, ''))
configured.test.projects = [
  {
    test: {
      name: 'production',
      mode: 'production',
      include: ['contract.test.mjs'],
    },
  },
]
row.config = 'export default ' + JSON.stringify(configured) + '\n'
assert(row)
assert.equal(row.genuine.cancel.status, 130)
assert.equal(row.genuine.cancel.traceAfterCancel, '')
assert.equal(row.genuine.recoveryExit, 0)
const fixture = mkdtempSync(join(consumer, '.next-istanbul-typed-spec-cancel-'))
mkdirSync(output, { recursive: true })
const canonical = (map) =>
  Object.fromEntries(
    Object.entries(map).map(([file, data]) => [
      file === 'total' ? file : basename(file),
      { ...data, ...('path' in data ? { path: basename(data.path) } : {}) },
    ])
  )
const cases = (report) =>
  report.testResults.map((file) => ({
    file: basename(file.name),
    status: file.status,
    message: file.message,
    cases: file.assertionResults.map(
      ({ duration: _duration, ...value }) => value
    ),
  }))
const summary = (report) =>
  Object.fromEntries(
    [
      'numTotalTestSuites',
      'numPassedTestSuites',
      'numFailedTestSuites',
      'numPendingTestSuites',
      'numTotalTests',
      'numPassedTests',
      'numFailedTests',
      'numPendingTests',
      'numTodoTests',
      'success',
      'snapshot',
    ].map((key) => [key, report[key]])
  )
try {
  for (const [name, { source: bytes, sha256 }] of Object.entries(
    row.sourceFiles
  )) {
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256)
    writeFileSync(join(fixture, name), bytes)
  }
  writeFileSync(join(fixture, 'vitest.config.mjs'), row.config)
  writeFileSync(join(output, 'ACTUAL-CONFIG.mjs'), row.config)
  writeFileSync(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  mkdirSync(join(fixture, '__snapshots__'))
  const snapshotFile = join(fixture, '__snapshots__/contract.test.mjs.snap')
  writeFileSync(snapshotFile, row.snapshot)
  mkdirSync(join(fixture, 'coverage'))
  writeFileSync(join(fixture, 'coverage/retained-sentinel.txt'), row.sentinel)
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    CI: '1',
    FORCE_COLOR: '0',
    NEXT_TELEMETRY_DISABLED: '1',
    TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
  }
  for (const key of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[key]
  const bin = source
    ? join(consumer, 'packages/next/dist/bin/next')
    : load.resolve('next/dist/bin/next')
  const args = (name, dest) => [
    bin,
    'test',
    fixture,
    '--run',
    '--reporter=json',
    '--outputFile=' + join(output, dest + '.json'),
    '--testNamePattern=' + name,
  ]
  const gate = join(fixture, 'gate.txt'),
    audit = join(output, 'cancel-owners')
  let signalled = false,
    signalError
  const attempt = () => {
    if (
      signalled ||
      !existsSync(gate) ||
      !existsSync(join(audit, 'starts.jsonl'))
    )
      return
    try {
      assert.equal(readFileSync(gate, 'utf8'), 'ACTUAL_PENDING_SPEC_LOAD')
      const owner = readFileSync(join(audit, 'starts.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse)
        .find((value) => value.type === 'start')
      if (!owner) return
      const started = execFileSync(
        '/bin/ps',
        ['-o', 'lstart=', '-p', String(owner.pid)],
        { encoding: 'utf8', timeout: 1000 }
      )
        .trim()
        .replace(/\s+/g, ' ')
      assert.equal(started, owner.started)
      signalled = true
      writeFileSync(
        join(output, 'SIGNAL.json'),
        JSON.stringify({ pid: owner.pid, started, actualSpecGate: true }) + '\n'
      )
      process.kill(owner.pid, 'SIGINT')
    } catch (error) {
      signalError = error
    }
  }
  const nativeWatcher = watch(fixture, attempt)
  watchFile(gate, { interval: 10, persistent: false }, attempt)
  let cancellation
  try {
    cancellation = await runOwnedNode(
      args('pending spec cannot start body', 'cancel-cases'),
      {
        cwd: fixture,
        env: { ...env, NEXT_TEST_SPEC_CANCEL: '1' },
        auditDir: audit,
        timeoutMs: 120000,
      }
    )
  } finally {
    nativeWatcher.close()
    unwatchFile(gate, attempt)
  }
  writeFileSync(
    join(output, 'cancel-owner.json'),
    JSON.stringify(cancellation, null, 2) + '\n'
  )
  writeFileSync(join(output, 'cancel-stdout.log'), cancellation.stdout)
  writeFileSync(join(output, 'cancel-stderr.log'), cancellation.stderr)
  assertOwnedNodeCompleted(cancellation, 'actual spec-load SIGINT')
  if (signalError) throw signalError
  assert(signalled)
  assert.equal(cancellation.status, 130, cancellation.stderr)
  assert.equal(cancellation.signal, null)
  assert(
    !existsSync(join(output, 'cancel-cases.json')),
    'OS SIGINT must not publish JSON'
  )
  assert.deepEqual(readdirSync(join(fixture, 'coverage')), [
    'retained-sentinel.txt',
  ])
  assert.equal(
    readFileSync(join(fixture, 'coverage/retained-sentinel.txt'), 'utf8'),
    row.sentinel
  )
  assert.equal(readFileSync(snapshotFile, 'utf8'), row.snapshot)
  assert(
    !existsSync(join(fixture, 'trace.jsonl')),
    'No body may run while the actual spec loader is pending'
  )
  const recovery = await runOwnedNode(args('spec recovery', 'recovery-cases'), {
    cwd: fixture,
    env,
    auditDir: join(output, 'recovery-owners'),
    timeoutMs: 120000,
  })
  writeFileSync(
    join(output, 'recovery-owner.json'),
    JSON.stringify(recovery, null, 2) + '\n'
  )
  writeFileSync(join(output, 'recovery-stdout.log'), recovery.stdout)
  writeFileSync(join(output, 'recovery-stderr.log'), recovery.stderr)
  assertOwnedNodeCompleted(recovery, 'actual spec-load recovery')
  assert.equal(recovery.status, row.genuine.recoveryExit, recovery.stderr)
  const report = JSON.parse(readFileSync(join(output, 'recovery-cases.json')))
  assert.deepEqual(cases(report), cases(row.genuine.cases))
  assert.deepEqual(summary(report), summary(row.genuine.cases))
  assert.deepEqual(
    canonical(report.coverageMap),
    canonical(row.genuine.cases.coverageMap)
  )
  for (const [name, expected] of Object.entries(row.genuine.reports)) {
    const actual = readFileSync(join(fixture, 'coverage', name), 'utf8')
    if (name.endsWith('.json'))
      assert.deepEqual(
        canonical(JSON.parse(actual)),
        canonical(JSON.parse(expected))
      )
    else assert.equal(actual, expected)
    copyFileSync(join(fixture, 'coverage', name), join(output, name))
  }
  assert.equal(
    readFileSync(join(fixture, 'trace.jsonl'), 'utf8'),
    row.genuine.recoveryTrace
  )
  assert.equal(readFileSync(snapshotFile, 'utf8'), row.snapshot)
  assert.equal(
    readFileSync(join(fixture, 'vitest.config.mjs'), 'utf8'),
    row.config
  )
  for (const [name, { source: bytes }] of Object.entries(row.sourceFiles))
    assert.equal(readFileSync(join(fixture, name), 'utf8'), bytes)
  assert.equal(
    readFileSync(join(fixture, 'coverage/retained-sentinel.txt'), 'utf8'),
    row.sentinel
  )
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        mode: 'production',
        actualPendingSpecLoad: true,
        actualSIGINTAfterSpecGate: true,
        cancelExit: 130,
        noBodyOnCancellation: true,
        noCancelledPublication: true,
        priorReportUnchanged: true,
        priorSnapshotUnchanged: true,
        recoveryExit: 0,
        completeRecoveryCaseProjection: true,
        completeRecoveryMaps: true,
        actualJSONCoverageMap: true,
        exactExistingSnapshot: true,
        allOwnersClosed: true,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
  writeFileSync(
    join(output, 'CLOSED.json'),
    JSON.stringify({ retired: !existsSync(fixture) }) + '\n'
  )
}
