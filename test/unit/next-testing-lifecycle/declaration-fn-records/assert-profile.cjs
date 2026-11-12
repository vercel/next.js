const assert = require('node:assert/strict')

// Case outcomes and report totals stay exact even when a test's trace consists
// mostly of repeated receiver, identity and state observations.
module.exports = function assertProfile(actual, cases, { exit } = {}) {
  assert.deepEqual(Object.keys(actual).sort(), [
    'cases',
    'counts',
    'exit',
    'rows',
  ])
  assert.deepEqual(actual.cases, cases)
  const count = (status) =>
    cases.filter((test) => test.status === status).length
  const failed = count('failed')
  assert.deepEqual(actual.counts, {
    numTotalTests: cases.length,
    numPassedTests: count('passed'),
    numFailedTests: failed,
    numPendingTests: count('skipped'),
    numTodoTests: count('todo'),
    success: failed === 0,
  })
  assert.equal(actual.exit, exit ?? Number(failed > 0))
  for (const row of actual.rows) {
    assert.deepEqual(Object.keys(row).sort(), ['prefix', 'stream', 'value'])
    assert.equal(row.stream, 'stdout')
    assert.equal(row.prefix, 'DECLARATION_FN')
  }
}
