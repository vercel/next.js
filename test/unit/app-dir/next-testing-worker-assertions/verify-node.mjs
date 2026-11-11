import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../../lib/next-testing-case-runner.mjs'

const [consumer, output, profile] = process.argv.slice(2)
assert(consumer && output)
assert(
  ['pass', 'setup-assert', 'setup-throw', 'cleanup-assert'].includes(profile)
)
fs.mkdirSync(output)
const source = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'node-records/suite.test.mjs.txt'
)
function checkWorkerOutcomes(report) {
  const setupFailed = profile.startsWith('setup-')
  const message =
    profile === 'setup-throw'
      ? 'actual worker setup failure'
      : 'expected 1 to be 2 // Object.is equality'
  const error = {
    phase: setupFailed ? 'runtime' : 'cleanup',
    severity: 'error',
    name: profile === 'setup-throw' ? 'Error' : 'AssertionError',
    message,
  }
  const errorFields = ({ phase, severity, name, message }) => ({
    phase,
    severity,
    name,
    message,
  })
  const cases = report.testResults.flatMap((file) => file.assertionResults)
  assert.equal(report.success, false)
  assert.equal(report.numPassedTests, setupFailed ? 0 : 2)
  assert.equal(report.numFailedTests, setupFailed ? 2 : 0)
  assert.equal(report.numPendingTests, 0)
  assert.deepEqual(
    cases.map((test) => test.status),
    Array(2).fill(setupFailed ? 'failed' : 'passed')
  )
  for (const test of cases) {
    assert.equal(test.failureMessages.length, setupFailed ? 1 : 0)
    if (setupFailed)
      assert(
        test.failureMessages[0].startsWith(error.name + ': ' + message + '\n')
      )
  }
  assert.deepEqual(
    report.testResults.map(({ status, message }) => ({ status, message })),
    [{ status: 'failed', message: setupFailed ? '' : message }]
  )
  assert.deepEqual(
    report.next.events
      .filter((event) => event.type === 'case-end')
      .map((event) => event.errors.map(errorFields)),
    setupFailed ? [[error], [error]] : [[], []]
  )
  assert.deepEqual(
    report.next.events
      .filter((event) => event.type === 'suite-end')
      .map(({ name, status, errors }) => ({
        name,
        status,
        errors: errors.map(errorFields),
      })),
    [{ name: '', status: setupFailed ? 'failed' : 'passed', errors: [] }]
  )
  assert.deepEqual(
    report.next.events
      .filter((event) => event.type === 'diagnostic')
      .map(({ diagnostic }) => errorFields(diagnostic)),
    setupFailed ? [] : [error]
  )
  assert.equal(report.next.summary.errors, setupFailed ? 2 : 1)
  assert.equal(report.next.summary.warnings, 0)
}

const profiles = []
for (const mode of ['development', 'production']) {
  profiles.push(
    await runCompilerCase({
      repo: consumer,
      output: path.join(output, mode),
      mode,
      files: [{ target: 'suite.test.mjs', bytes: fs.readFileSync(source) }],
      expectedNames: ['first', 'second'],
      expectedExit: profile === 'pass' ? 0 : 1,
      timeoutMs: 120000,
      config: {
        test: {
          mode,
          environment: 'node',
          include: ['suite.test.mjs'],
          maxWorkers: 1,
          fileParallelism: false,
          testTimeout: 5000,
          hookTimeout: 5000,
          includeTaskLocation: false,
        },
      },
      env: { WORKER_FIXTURE_PROFILE: profile },
      ...(profile === 'pass' ? {} : { checkOutcomes: checkWorkerOutcomes }),
      check(report) {
        const setupFailed = profile.startsWith('setup-')
        const prefix = 'WORKER_ASSERTION_ROW '
        const rows = report.next.events
          .filter((event) => event.type === 'output')
          .flatMap((event) => event.text.split('\n'))
          .filter((line) => line.startsWith(prefix))
          .map((line) => JSON.parse(line.slice(prefix.length)))
        const setupEvents =
          profile === 'setup-throw'
            ? ['setup-entry', 'setup-error']
            : ['setup-entry', 'setup-before', 'setup-error']
        const events = setupFailed
          ? [...setupEvents, ...setupEvents]
          : [
              'setup-entry',
              ...(profile === 'pass' ? ['setup-before', 'setup-after'] : []),
              'body-before',
              'body-after',
              'body-before',
              'body-after',
              'cleanup-entry',
              'cleanup-before',
              profile === 'pass' ? 'cleanup-after' : 'cleanup-error',
            ]
        assert.deepEqual(
          rows.map((row) => row.phase),
          events
        )
        assert.deepEqual(rows.at(-1).counts, {
          setup: setupFailed ? 2 : 1,
          cleanup: setupFailed ? 0 : 1,
          body: setupFailed ? 0 : 2,
        })
      },
    })
  )
}
const result = {
  allPassed: true,
  profiles,
  actualCases: profiles.reduce((sum, row) => sum + row.cases, 0),
  behavioralChecks: true,
  allPhysicalOwnersJoined: true,
}
fs.writeFileSync(
  path.join(output, 'VERIFIED.json'),
  JSON.stringify(result, null, 2) + '\n'
)
console.log(JSON.stringify(result))
