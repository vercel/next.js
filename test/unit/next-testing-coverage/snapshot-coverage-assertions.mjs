import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Snapshot/selection tests care about outcomes and snapshot accounting, rather
// than the serialization of every field in a third-party runner's task graph.
export function assertSnapshotReport(report, expected) {
  assert.equal(report.numPassedTests, expected.passed)
  assert.equal(report.numFailedTests, expected.failed)
  assert.equal(report.numPendingTests, expected.pending)
  assert.deepEqual(
    report.testResults.flatMap((file) =>
      file.assertionResults.map((test) => [
        test.fullName,
        test.status,
        test.failureMessages.map((message) => message.split('\n')[0]),
      ])
    ),
    expected.cases
  )
  assert.deepEqual(
    report.testResults.map((file) => (file.message ?? '').split('\n')[0]),
    expected.fileErrors
  )
  assert.deepEqual(report.snapshot, expected.snapshot)
}

// Source-position mapping and reporter formatting have their own focused tests.
// Here we require the selected files and every hit count, including zeros.
export function assertSnapshotCoverage(directory, fixture, expected) {
  assert.deepEqual(readdirSync(directory).sort(), [
    'coverage-final.json',
    'coverage-summary.json',
    'lcov.info',
  ])
  const map = JSON.parse(readFileSync(join(directory, 'coverage-final.json')))
  assertCoverageCounters(map, fixture, expected)
}

export function assertCoverageCounters(map, fixture, expected) {
  const hits = Object.fromEntries(
    Object.entries(map).map(([name, value]) => [
      relative(fixture, name).split(sep).join('/'),
      {
        statements: Object.values(value.s),
        functions: Object.values(value.f),
        branches: Object.values(value.b),
      },
    ])
  )
  assert.deepEqual(hits, expected)
}

// Typed-source profiles require the authored cases to pass and only the chosen
// subject to contribute coverage. Task-tree serialization is tested separately.
export function assertPassedCoverageCases(report, caseNames) {
  assert.equal(report.success, true)
  assert.equal(report.numPassedTests, caseNames.length)
  assert.equal(report.numFailedTests, 0)
  assert.equal(report.numPendingTests, 0)
  assert.equal(report.numTotalTests, caseNames.length)
  assert.equal(report.numFailedTestSuites, 0)
  assert.deepEqual(
    report.testResults.flatMap((file) =>
      file.assertionResults.map((test) => [
        test.fullName,
        test.status,
        test.failureMessages,
      ])
    ),
    caseNames.map((name) => [name, 'passed', []])
  )
  assert.deepEqual(
    report.testResults.map((file) => file.message),
    ['']
  )
  assert.equal(report.snapshot.total, 0)
}
