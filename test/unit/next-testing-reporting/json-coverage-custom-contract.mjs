import assert from 'node:assert/strict'
import { join } from 'node:path'

export function assertCoveragePublication({
  name,
  fixture,
  status,
  report,
  trace,
  coverageFiles,
  stderr,
}) {
  const endFailed = name.includes('end')
  assert.equal(status, name === 'success' ? 0 : 1)
  assert.equal(report.next.version, 1)
  assert.equal(report.success, true)
  assert.equal(report.numTotalTestSuites, 1)
  assert.equal(report.numPassedTestSuites, 1)
  assert.equal(report.numFailedTestSuites, 0)
  assert.equal(report.numPendingTestSuites, 0)
  assert.equal(report.numTotalTests, 1)
  assert.equal(report.numPassedTests, 1)
  assert.equal(report.numFailedTests, 0)
  assert.equal(report.numPendingTests, 0)
  assert.equal(report.numTodoTests, 0)
  assert.equal(report.snapshot.total, 0)
  assert.equal(report.snapshot.failure, false)
  assert.equal(report.snapshot.didUpdate, false)
  assert.equal(report.testResults.length, 1)
  const file = report.testResults[0]
  assert.equal(file.name, join(fixture, 'suite.test.mjs'))
  assert.equal(file.status, 'passed')
  assert.equal(file.message, '')
  assert.equal(file.assertionResults.length, 1)
  const test = file.assertionResults[0]
  assert.equal(test.title, 'completed body')
  assert.equal(test.fullName, 'completed body')
  assert.equal(test.status, 'passed')
  assert.deepEqual(test.failureMessages, [])

  // Completion errors must not remove the already collected map from JSON.
  // Counter/mapping details beyond this authored branch belong to coverage tests.
  const subject = join(fixture, 'subject.mjs')
  assert.deepEqual(Object.keys(report.coverageMap), [subject])
  const coverage = report.coverageMap[subject]
  assert.equal(coverage.path, subject)
  assert.deepEqual(Object.values(coverage.s), [1, 1, 0])
  assert.deepEqual(Object.values(coverage.f), [1])
  assert.deepEqual(Object.values(coverage.b), [[1, 0]])
  assert.deepEqual(
    Object.values(coverage.fnMap).map((fn) => fn.name),
    ['choose']
  )

  assert.deepEqual(
    trace.map((row) => row.event),
    ['end', 'global-teardown', 'close']
  )
  for (const row of trace.slice(1)) {
    assert.equal(row.jsonExists, true)
    assert.equal(row.coverageExists, !endFailed)
  }
  assert.deepEqual(
    coverageFiles,
    endFailed
      ? []
      : ['coverage-final.json', 'coverage-summary.json', 'lcov.info']
  )
  for (const [part, message] of [
    ['end', 'owned custom matrix end error'],
    ['config', 'owned custom matrix global teardown error'],
    ['close', 'owned custom matrix close error'],
  ])
    assert.equal(stderr.includes(message), name.includes(part), message)
}
