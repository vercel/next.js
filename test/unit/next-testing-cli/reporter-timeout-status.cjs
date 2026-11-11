const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const syncFs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createHash } = require('node:crypto')
const [scenario, inputDist, inputFixture] = process.argv.slice(2)
const scenarios = {
  'numeric-fraction': '0.5',
  'numeric-negative': '-1',
  'numeric-nan': 'Number.NaN',
  'numeric-infinity': 'Number.POSITIVE_INFINITY',
  'numeric-mutable': '250',
  'status-pass-preserve': '250',
  'status-fail-preserve': '250',
  'status-pass-clear': '250',
  'status-fail-clear': '250',
}
assert.ok(Object.hasOwn(scenarios, scenario), 'Unknown component scenario')
const dist =
  inputDist ??
  path.join(path.dirname(require.resolve('next/package.json')), 'dist')
const fixture =
  inputFixture ?? path.join(__dirname, 'reporter-timeout-status-fixtures')
const { openTestConfiguration } = require(
  path.join(dist, 'experimental/testing/config.js')
)
const { openCustomReporters } = require(
  path.join(dist, 'experimental/testing/reporting/custom-reporter.js')
)
const typed = (value) => ({
  type: typeof value,
  value:
    typeof value === 'number' && !Number.isFinite(value)
      ? String(value)
      : value === undefined
        ? null
        : value,
})
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const sourceFile = (name) => {
  const filename = path.join(fixture, name)
  return syncFs.existsSync(filename) ? filename : filename + '.txt'
}
let directory,
  configuration,
  reporter,
  prepared,
  physicallyJoined = false
const lifetime = new AbortController()
let reporterStderr = '',
  reporterStdout = '',
  deadline
const completionStatus = scenario.startsWith('status-fail-')
  ? 'failed'
  : 'passed'
const expectedNativeCode =
  scenario.endsWith('-clear') || scenario.startsWith('numeric-')
    ? 0
    : completionStatus === 'failed'
      ? 1
      : 7
async function main() {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'next-timeout-status-'))
  const inputHashes = {}
  for (const name of [
    'reporter.mjs',
    'record.mjs',
    'pass.test.mjs',
    'fail.test.mjs',
  ]) {
    const bytes = await fs.readFile(sourceFile(name))
    inputHashes[name] = hash(bytes)
    await fs.writeFile(path.join(directory, name), bytes)
  }
  await fs.writeFile(
    path.join(directory, 'next.test.config.mjs'),
    `export default {test:{teardownTimeout:${scenarios[scenario]}}}\n`
  )
  process.env.LIFECYCLE_TRACE = path.join(directory, 'trace.jsonl')
  process.env.LIFECYCLE_PROFILE = scenario
  configuration = await openTestConfiguration(directory, lifetime.signal)
  const normalizedInput = typed(configuration.config.teardownTimeout)
  reporter = await openCustomReporters({
    projectDir: directory,
    signal: lifetime.signal,
    reporters: [path.join(directory, 'reporter.mjs')],
    transport: await configuration.openReporterTransport(),
    finalExitLifecycle: {
      teardownTimeout: configuration.config.teardownTimeout,
    },
    write(text) {
      reporterStdout += text
      process.stderr.write(text)
    },
    writeError(text) {
      reporterStderr += text
      process.stderr.write(text)
    },
  })
  // Valid completion payload controls the reporter component. No project or body
  // execution is invoked and no Next report is produced or claimed here.
  const controlledCompletion = {
    entries: [],
    files: [],
    suites: [],
    cases: [],
    events: [],
    status: completionStatus,
  }
  await reporter.finish(controlledCompletion)
  await reporter.dispose()
  reporter = undefined
  prepared = await configuration.prepareFinalExit()
  assert.ok(prepared, 'Actual root reporter must provide prepared final exit')
  assert.equal(prepared.initialCloseFailure, undefined)
  const preparedExitCode = typed(prepared.exitCode)
  // Successful controller cleanup makes no new status selection. The actual
  // reporter realm retains its onInit/framework/onClose authored status.
  const physicalExit = configuration.physicalExit
  assert.ok(physicalExit && typeof physicalExit.then === 'function')
  await configuration.dispose()
  configuration = undefined
  const nativeExit = await prepared.finalize({ kind: 'completed' })
  const joinedPhysicalExit = await physicalExit
  physicallyJoined = true
  assert.deepEqual(joinedPhysicalExit, nativeExit)
  assert.equal(nativeExit.reason, 'exit')
  assert.equal(nativeExit.signal, null)
  assert.equal(nativeExit.code, expectedNativeCode)
  await configuration?.dispose()
  configuration = undefined
  const trace = (await fs.readFile(path.join(directory, 'trace.jsonl'), 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse)
  if (process.env.COMPONENT_RAW_OBSERVATION) {
    await fs.writeFile(
      process.env.COMPONENT_RAW_OBSERVATION,
      JSON.stringify(
        {
          scenario,
          node: process.version,
          normalizedInput,
          preparedExitCode,
          nativeExit,
          joinedPhysicalExit,
          inputHashes,
          trace,
          actualReporterPid: trace[0]?.pid,
          reporterStdout,
          reporterStderr,
          actualReporterJoined: true,
          bodyExecuted: false,
          nextReportProduced: false,
        },
        null,
        2
      ) + '\n'
    )
  }
  const initialTimeout = typed(
    scenario === 'numeric-fraction'
      ? 0.5
      : scenario === 'numeric-negative'
        ? -1
        : scenario === 'numeric-nan'
          ? Number.NaN
          : scenario === 'numeric-infinity'
            ? Number.POSITIVE_INFINITY
            : 250
  )
  const laterTimeout =
    scenario === 'numeric-mutable' ? typed(40) : initialTimeout
  const unset = typed(undefined)
  const authored = scenario.startsWith('status-') ? typed(7) : unset
  const completed = completionStatus === 'failed' ? typed(1) : authored
  const closed = scenario.endsWith('-clear') ? unset : completed
  const expectedCodes = [
    unset,
    authored,
    completed,
    completed,
    closed,
    closed,
    closed,
    closed,
    closed,
    typed(expectedNativeCode),
  ]
  const expectedKinds = [
    'init-before',
    'init-after',
    'run-end',
    'close-before',
    'close-after',
    'close-finished',
    'timeout-getter',
    'timeout-entered',
    'timeout-finished',
    'native-exit-event',
  ]
  assert.deepEqual(normalizedInput, initialTimeout)
  assert.deepEqual(preparedExitCode, closed)
  assert.deepEqual(
    trace.map((row) => row.kind),
    expectedKinds
  )
  trace.forEach((row, index) => {
    assert.deepEqual(
      row.exitCode,
      expectedCodes[index],
      row.kind + ' typed status'
    )
    assert.deepEqual(
      row.teardownTimeout,
      index < 4 ? initialTimeout : laterTimeout,
      row.kind + ' typed live config'
    )
  })
  assert.equal(trace[5].hasRef, true)
  assert.equal(trace[6].receiver, true)
  assert.equal(trace[7].receiver, true)
  assert.equal(trace[7].argc, 0)
  assert.equal(trace[9].eventCode, expectedNativeCode)
  const closeFinishedToTimeoutMs =
    Number(BigInt(trace[7].hr) - BigInt(trace[5].hr)) / 1e6
  assert.ok(closeFinishedToTimeoutMs > 0 && closeFinishedToTimeoutMs < 1000)
  if (scenario === 'numeric-mutable') assert.ok(closeFinishedToTimeoutMs > 30)
  if (scenario.startsWith('status-')) assert.ok(closeFinishedToTimeoutMs > 200)
  const actualReporterPid = trace[0]?.pid
  assert.ok(
    Number.isSafeInteger(actualReporterPid) && actualReporterPid !== process.pid
  )
  assert.ok(
    trace.every((row) => row.pid === actualReporterPid),
    'No body trace is expected in this component'
  )
  assert.throws(() => process.kill(actualReporterPid, 0), { code: 'ESRCH' })
  for (const [name, expected] of Object.entries(inputHashes))
    assert.equal(hash(await fs.readFile(path.join(directory, name))), expected)
  console.log(
    JSON.stringify({
      scenario,
      node: process.version,
      controlledCompletionStatus: completionStatus,
      scope:
        'Actual config/reporter component phase/status/config/timer/native-exit only; controlled completion, no NativeProject, no body or report parity',
      normalizedInput,
      preparedExitCode,
      nativeExit,
      actualReporterPid,
      inputHashes,
      trace,
      reporterStdout,
      reporterStderr,
      actualReporterJoined: true,
      configDisposedBeforeFinalization: true,
      physicalExitPromiseJoined: true,
      bodyExecuted: false,
      nextReportProduced: false,
      semanticTypedPhasesAsserted: true,
      closeFinishedToTimeoutMs,
      helperOnlyNativeObservations:
        globalThis[Symbol.for('private.reporter.config.native-observations')] ??
        null,
      guardScope:
        'An execArgv ReadonlySWC preload applies to this helper only; runTestProcess deliberately supplies its own child execArgv. No inherited cross-process native guard or NativeProject-call instrumentation is claimed.',
    })
  )
}
deadline = setTimeout(() => {
  const error = new Error(
    'Actual reporter timeout/status component exceeded bound'
  )
  console.error(error)
  lifetime.abort(error)
}, 10000)
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      if (!physicallyJoined)
        lifetime.abort(
          new Error('Component cleanup owns unfinished actual actor')
        )
      try {
        await reporter?.dispose()
      } finally {
        try {
          if (prepared && !physicallyJoined)
            await prepared.finalize({
              kind: 'cancelled',
              reason: lifetime.signal.reason,
            })
        } finally {
          await configuration?.dispose()
        }
      }
    } finally {
      if (directory) await fs.rm(directory, { recursive: true, force: true })
      clearTimeout(deadline)
    }
  })
