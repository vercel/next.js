import assert from 'node:assert/strict'
import path from 'node:path'

export function standardReport(report) {
  const { next, startTime, ...data } = report
  return {
    ...data,
    testResults: report.testResults.map(
      ({ startTime, endTime, name, assertionResults, ...file }) => ({
        ...file,
        name: path.basename(name),
        assertionResults: assertionResults.map(({ duration, ...test }) => test),
      })
    ),
  }
}

export function authoredRows(rows) {
  return rows.map(({ now, pid, ...row }) => {
    assert.equal(typeof now, 'number')
    assert.equal(typeof pid, 'number')
    if (!row.error) return row
    const { stack, ...error } = row.error
    assert.equal(typeof stack, 'string')
    assert(stack.length > 0)
    return { ...row, error }
  })
}

export function terminalRows(rows, fixture, phase, variant) {
  const error = rows[0]?.modules[0]?.suites[0]?.errors[0]
  assert(error, 'The actual affected Suite must retain its timeout error')
  assert.deepEqual(Object.keys(error).sort(), [
    'constructor',
    'message',
    'name',
    'stack',
    'stacks',
    'toString',
  ])
  const name =
    phase === 'setup' ? 'AroundHookSetupError' : 'AroundHookTeardownError'
  assert.equal(error.name, name)
  assert.equal(error.constructor, `Function<${name}>`)
  assert.equal(error.toString, 'Function<toString>')
  assert.equal(
    error.message,
    `The ${phase} phase of "aroundAll" hook timed out after 100ms.`
  )
  assert.equal(typeof error.stack, 'string')
  assert(error.stack.length > 0)
  assert.equal(Object.hasOwn(error, 'operation'), false)
  assert.deepEqual(error.stacks, [
    {
      method: '',
      file: path.join(fixture, 'suite.test.mjs'),
      line: variant === 'gated' ? 10 : 11,
      column: 3,
    },
  ])
  // Preserve the full raw stack in OBSERVED.json; runtime-internal frames differ.
  const normalized = structuredClone(rows)
  const projected = normalized[0].modules[0].suites[0].errors[0]
  projected.stack = '<runtime stack retained in raw records>'
  projected.stacks[0].file = path.basename(projected.stacks[0].file)
  return normalized
}

export function observationModel(observed, report, fixture, phase, variant) {
  return {
    status: observed.status,
    rows: authoredRows(observed.rows),
    reporterRows: terminalRows(observed.reporterRows, fixture, phase, variant),
    cases: observed.cases,
    summary: observed.summary,
    report: standardReport(report),
  }
}

export function compareObservation(
  observed,
  report,
  expected,
  fixture,
  phase,
  variant
) {
  assert.deepEqual(
    observationModel(observed, report, fixture, phase, variant),
    expected,
    'Complete case, counter, callback, Suite error and standard report models'
  )
  const events = observed.rows.map((row) => row.event)
  const index = (event) => {
    const position = events.indexOf(event)
    assert(position >= 0, `The actual ${event} callback must run`)
    return position
  }
  assert(index('following-beforeAll-entry') < index('wrapper-finally'))
  assert(index('bounded-wait-settled') < index('wrapper-finally'))
  if (variant === 'root-gated') {
    assert(index('following-body-after') < index('wrapper-finally'))
    assert(index('root-afterAll-entry') < index('wrapper-finally'))
    assert(index('wrapper-finally') < index('root-afterAll-settled'))
  } else {
    assert(index('wrapper-finally') < index('following-beforeAll-settled'))
    assert(index('wrapper-finally') < index('following-body-before'))
  }
  return {
    actualCases: observed.cases.length,
    wholeRows: observed.rows.length,
    completeModelsMatch: true,
    exactPhaseErrorKeysAndMappedRegistrationMatch: true,
    actualWrapperFinallyAndDisjointRecoveryObserved: true,
    fullRawRuntimeStacksRetainedWithoutCrossRunnerFormattingClaim: true,
  }
}
