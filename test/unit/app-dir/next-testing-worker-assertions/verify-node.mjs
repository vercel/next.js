import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, profile] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify-node.mjs <source-or-consumer-root> <new-output-directory> <profile>'
)
assert(
  ['pass', 'setup-assert', 'setup-throw', 'cleanup-assert'].includes(profile)
)
const consumer = fs.realpathSync(consumerArg)
const output = path.resolve(outputArg)
fs.mkdirSync(output)
const base = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'node-records'
)
const manifest = JSON.parse(fs.readFileSync(base + '/REFERENCE.json'))
const profiles = []
const load = createRequire(consumer + '/package.json')
const next = path.dirname(load.resolve('next/package.json'))
const bin = load.resolve('next/dist/bin/next')
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const save = (where, name, value) =>
  fs.writeFileSync(
    path.join(where, name),
    JSON.stringify(value, null, 2) + '\n'
  )
const pins = Object.fromEntries(
  [
    'package.json',
    'dist/bin/next',
    'dist/experimental/testing/runner/collector.js',
    'dist/experimental/testing/runner/fixtures.js',
    'dist/experimental/testing/assertions/index.js',
    'dist/experimental/testing/assertions/utilities.js',
    'dist/experimental/testing/assertions/fake-timers-core.js',
    'dist/experimental/testing/client/fake-timers.js',
    'dist/experimental/testing/client/runtime.js',
    'dist/experimental/testing/mocking/module-cache.js',
    'dist/experimental/testing/vitest.js',
  ].map((name) => [name, sha(fs.readFileSync(next + '/' + name))])
)
for (const mode of ['development', 'production']) {
  const label = process.versions.node.split('.')[0] + '-' + mode + '-' + profile
  assert(
    manifest.profiles[label],
    'A genuine model is required for this actual Node engine'
  )
  const out = output + '/' + mode
  fs.mkdirSync(out)
  const body = fs.readFileSync(base + '/suite.test.mjs.txt')
  assert.equal(sha(body), manifest.bodySHA256)
  const expected = JSON.parse(
    fs.readFileSync(base + '/' + profile + '-model.json')
  )
  const expectedReport = JSON.parse(
    fs.readFileSync(base + '/' + profile + '-report.json')
  )
  const fixture = fs.mkdtempSync(
    path.join(consumer, '.next-worker-fixture-assertions-')
  )
  fs.symlinkSync(consumer + '/node_modules', fixture + '/node_modules', 'dir')
  fs.writeFileSync(
    fixture + '/package.json',
    JSON.stringify({ type: 'module', private: true }) + '\n'
  )
  fs.writeFileSync(fixture + '/suite.test.mjs', body)
  const reporter = `import fs from 'node:fs';export default class{onUserConsoleLog(log){fs.appendFileSync(process.env.WORKER_ASSERTION_LOG,JSON.stringify({hook:'console',log})+'\\n')}onTestRunEnd(modules,errors,reason){fs.appendFileSync(process.env.WORKER_ASSERTION_LOG,JSON.stringify({hook:'end',reason,errors:errors.map(error=>({name:error.name,message:error.message})),modules:modules.map(module=>({state:module.state(),errors:module.errors()}))})+'\\n')}}\n`
  fs.writeFileSync(fixture + '/reporter.mjs', reporter)
  fs.writeFileSync(
    fixture + '/next.config.mjs',
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  const test = {
    include: ['suite.test.mjs'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 5000,
    hookTimeout: 5000,
    includeTaskLocation: false,
    mode,
    environment: 'node',
  }
  fs.writeFileSync(
    fixture + '/next.test.config.json',
    JSON.stringify({ test }) + '\n'
  )
  fs.writeFileSync(out + '/console.jsonl', '')
  const args = [
    bin,
    'test',
    fixture,
    '--run',
    '--reporter=json',
    '--reporter=' + fixture + '/reporter.mjs',
    '--outputFile=' + out + '/report.json',
  ]
  const env = {
    ...process.env,
    WORKER_FIXTURE_PROFILE: profile,
    NODE_ENV: mode,
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    WORKER_ASSERTION_LOG: out + '/console.jsonl',
  }
  for (const name of [
    'CI',
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[name]
  save(out, 'INPUTS.json', {
    mode,
    label,
    profile,
    consumer,
    actualNode: process.version,
    args,
    sourceSHA256: sha(body),
    test,
    pins,
    bounds: { cli: 120000, test: 5000, hook: 5000 },
  })
  function standard(report) {
    const { next, startTime, ...data } = report
    return {
      ...data,
      testResults: report.testResults.map(
        ({ startTime, endTime, name, assertionResults, ...file }) => ({
          ...file,
          name: path.basename(name),
          assertionResults: assertionResults.map(
            ({ duration, ...test }) => test
          ),
        })
      ),
    }
  }
  let owner
  try {
    owner = await runOwnedNode(args, {
      cwd: fixture,
      env,
      auditDir: out + '/owners',
      timeoutMs: 120000,
    })
    save(out, 'OWNER.json', owner)
    fs.writeFileSync(out + '/stdout.log', owner.stdout)
    fs.writeFileSync(out + '/stderr.log', owner.stderr)
    assertOwnedNodeCompleted(
      owner,
      'Next actual worker fixture assertions ' + label
    )
    const report = fs.existsSync(out + '/report.json')
      ? JSON.parse(fs.readFileSync(out + '/report.json'))
      : null
    const logs = fs
      .readFileSync(out + '/console.jsonl', 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    const rows = logs
      .filter((row) => row.hook === 'console')
      .flatMap((row) =>
        row.log.content
          .split('\n')
          .filter((line) => line.startsWith('WORKER_ASSERTION_ROW '))
          .map((line) => JSON.parse(line.slice('WORKER_ASSERTION_ROW '.length)))
      )
    const terminal = logs.filter((row) => row.hook === 'end')
    const observed = {
      status: owner.status,
      rows,
      cases: report?.testResults.flatMap((file) =>
        file.assertionResults.map((test) => ({
          name: test.fullName,
          state: test.status,
        }))
      ),
      summary: report
        ? Object.fromEntries(
            Object.entries(report).filter(
              ([key]) => key.startsWith('num') || key === 'success'
            )
          )
        : null,
      terminal,
      allOwnersJoined: true,
    }
    save(out, 'OBSERVED.json', observed)
    if (report) {
      save(out, 'STANDARD-NEXT.json', standard(report))
      save(out, 'STANDARD-GENUINE.json', standard(expectedReport))
      save(out, 'NEXT-ENVELOPE.json', report.next)
    }
    assert.deepEqual(rows, expected.rows, 'Complete authored callback rows')
    assert.deepEqual(observed.cases, expected.cases, 'Every actual case result')
    const expectedStatus = profile === 'cleanup-assert' ? 1 : expected.status
    assert.equal(owner.status, expectedStatus)
    assert(report, 'Actual completed JSON report is required')
    if (profile === 'pass') {
      assert.deepEqual(
        standard(report),
        standard(expectedReport),
        'Complete standard pass report'
      )
      assert.deepEqual(
        terminal,
        expected.terminal,
        'Complete reporter termination model'
      )
    } else if (profile === 'cleanup-assert') {
      assert.equal(report.success, false)
      assert.equal(report.numPassedTests, 2)
      assert.equal(report.numFailedTests, 0)
      assert.equal(report.numFailedTestSuites, 1)
      assert.equal(terminal.length, 1)
      assert.equal(terminal[0].reason, 'failed')
      assert.equal(terminal[0].errors.length, 0)
      assert.equal(terminal[0].modules.length, 1)
      assert.equal(terminal[0].modules[0].state, 'failed')
      const errors = terminal[0].modules[0].errors
      assert.equal(errors.length, 1)
      assert.equal(errors[0].phase, 'cleanup')
      assert.equal(errors[0].name, 'AssertionError')
      assert.equal(
        errors[0].message,
        'expected 1 to be 2 // Object.is equality'
      )
    } else {
      assert.deepEqual(observed.summary, expected.summary, 'Complete counters')
      assert.equal(report.testResults.length, 1)
      for (const test of report.testResults[0].assertionResults) {
        assert.equal(test.failureMessages.length, 1)
        const headline =
          profile === 'setup-assert'
            ? 'AssertionError: expected 1 to be 2 // Object.is equality'
            : 'Error: actual worker setup failure'
        assert.equal(test.failureMessages[0].split('\n')[0], headline)
        assert.match(test.failureMessages[0], /suite\.test\.mjs/)
      }
    }
    const result = {
      mode,
      label,
      profile,
      actualStatus: owner.status,
      actualCases: observed.cases,
      actualSummary: observed.summary,
      wholeRows: rows.length,
      allOwnersJoined: true,
      originalAuthoredBytesAndBoundsHeld: true,
      allRowsAndCasesMatch: true,
      completeStandardReportMatches: profile === 'pass',
      setupErrorHeadlinesMatch: profile.startsWith('setup-'),
      stableCleanupFailureRetained: profile === 'cleanup-assert',
      genuineCleanupSwallowingIsExplicitMismatch: profile === 'cleanup-assert',
      noFullCrossRunnerFailureStackFormattingClaim: profile !== 'pass',
    }
    profiles.push(result)
    save(out, 'VERIFIED.json', result)
    console.log(JSON.stringify(result))
  } finally {
    if (
      owner &&
      !owner.timedOut &&
      owner.leakedProcesses.length === 0 &&
      owner.cleanupFailures.length === 0
    )
      fs.rmSync(fixture, { recursive: true, force: true })
    save(out, 'CLOSED.json', {
      actualOwnerReceipt: !!owner,
      fixtureRetired: !fs.existsSync(fixture),
    })
    for (const [name, pin] of Object.entries(pins))
      assert.equal(sha(fs.readFileSync(next + '/' + name)), pin)
  }
}
save(output, 'VERIFIED.json', {
  profiles,
  allPassed: profiles.length === 2,
  actualCases: profiles.reduce((n, p) => n + p.actualCases.length, 0),
  wholeRows: profiles.reduce((n, p) => n + p.wholeRows, 0),
  allPhysicalOwnersJoined: true,
  originalBoundsHeld: true,
  sharedCohortsAndBroaderWorkerAssertionMatrixRemainUnqualified: true,
})
